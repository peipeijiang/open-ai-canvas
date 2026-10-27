package app

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"yingce/backend/internal/model"
)

func TestCloudAgentStaleApprovalEndsWithoutSubmission(t *testing.T) {
	for _, viaDecision := range []bool{false, true} {
		t.Run(map[bool]string{false: "scheduler", true: "decision"}[viaDecision], func(t *testing.T) {
			s, db, args := agentMediaFixture(t)
			run, _ := agentMediaRun(t, s, args, "request_approval")
			if err := s.advanceCloudAgent(run); err != nil {
				t.Fatal(err)
			}
			run, err := s.repo.CloudAgent("user", run.ID)
			if err != nil || run.Status != "waiting_approval" {
				t.Fatalf("missing approval: %v %+v", err, run)
			}
			state, err := cloudAgentDecode(run)
			if err != nil || state.Approval == nil {
				t.Fatalf("missing approval checkpoint: %v", err)
			}
			approvalID := state.Approval.ID
			var beforeTasks, beforeOrders int64
			db.Model(&model.Task{}).Count(&beforeTasks)
			db.Model(&model.BillingOrder{}).Count(&beforeOrders)
			// A valid, current approval must remain paused when the scheduler sees it.
			if err := s.advanceCloudAgent(run); err != nil {
				t.Fatal(err)
			}
			current, _ := s.repo.CloudAgent("user", run.ID)
			if current.Status != "waiting_approval" || current.Revision != run.Revision {
				t.Fatal("scheduler consumed a current approval")
			}
			stale := strings.Replace(run.StateJSON, cloudAgentCapabilitySetHash(), strings.Repeat("0", len(cloudAgentCapabilitySetHash())), 1)
			if err := db.Model(&model.CloudAgentExecution{}).Where("id = ?", run.ID).Update("state_json", stale).Error; err != nil {
				t.Fatal(err)
			}
			run, _ = s.repo.CloudAgent("user", run.ID)
			if viaDecision {
				err := s.DecideCloudAgentApproval("user", run.ID, approvalID, "approve", "")
				var conflict *AppError
				if !errors.As(err, &conflict) || conflict.Status != 409 || conflict.Reason != cloudAgentContractChangedReason {
					t.Fatalf("missing typed contract rejection: %v", err)
				}
			} else {
				active, err := s.repo.ActiveCloudAgents()
				if err != nil || len(active) != 1 || active[0].ID != run.ID {
					t.Fatalf("waiting approval absent from scheduler scan: %v %+v", err, active)
				}
				if err := s.advanceCloudAgent(&active[0]); err != nil {
					t.Fatal(err)
				}
			}
			run, _ = s.repo.CloudAgent("user", run.ID)
			if run.Status != "failed" || run.FailureMessage != cloudAgentContractChangedMessage || !run.CleanupPending {
				t.Fatalf("stale approval was not closed: status=%s cleanup=%t failure=%s", run.Status, run.CleanupPending, run.FailureMessage)
			}
			if err := s.finishCloudAgentCleanup(context.Background(), run); err != nil {
				t.Fatal(err)
			}
			view, err := s.CloudAgentRun("user", run.ID)
			if err != nil || view.Approval != nil || view.CleanupPending {
				t.Fatalf("stale approval remains actionable: %v %+v", err, view)
			}
			var afterTasks, afterOrders int64
			db.Model(&model.Task{}).Count(&afterTasks)
			db.Model(&model.BillingOrder{}).Count(&afterOrders)
			if beforeTasks != afterTasks || beforeOrders != afterOrders {
				t.Fatalf("expiry submitted a task/order: tasks %d -> %d, orders %d -> %d", beforeTasks, afterTasks, beforeOrders, afterOrders)
			}
			// A fresh message uses a new contract while retaining the same parent/history.
			req := agentTestRequest()
			req.PermissionMode, req.Prompt, req.IdempotencyKey = "auto", "继续刚才的任务", "after-stale-approval"
			child, err := s.CreateCloudAgentRun("user", req, run.ID)
			if err != nil || child.ParentID != run.ID || child.PermissionMode != "auto" {
				t.Fatalf("cannot continue the same conversation: %v %+v", err, child)
			}
		})
	}
}

// 自研（2026-09-15）：部署改了策略或能力集后，旧轮次的 policy 快照与当前二进制不一致，
// validateCloudAgentPolicySnapshot 会拒绝续跑。旧行为把用户卡死在「请新建一轮消息」，
// 每个对话都得手动重建；新行为继承历史自动接新轮，用户无感。
func TestCloudAgentContinuesAfterContractChange(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	canvas := model.CanvasProject{ID: "agent-canvas", UserID: "user", Title: "test", PayloadJSON: `{"nodes":[]}`}
	if err := db.Create(&canvas).Error; err != nil {
		t.Fatal(err)
	}
	root, err := s.CreateCloudAgentRun("user", agentTestRequest(), "")
	if err != nil {
		t.Fatal(err)
	}
	// 让第一轮结束。
	if err := db.Model(&model.Task{}).Where("id = ?", root.ID).
		Updates(map[string]any{"status": model.TaskStatusFailed, "error": "mock failure"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.CloudAgentExecution{}).Where("id = ?", root.ID).Update("status", "failed").Error; err != nil {
		t.Fatal(err)
	}
	// 在该轮快照里制造一次「合同变更」：把能力集哈希改掉。
	execution, err := s.repo.CloudAgent("user", root.ID)
	if err != nil {
		t.Fatal(err)
	}
	current := cloudAgentCapabilitySetHash()
	if !strings.Contains(execution.StateJSON, current) {
		t.Fatalf("fixture does not contain the capability set hash %s", current)
	}
	stale := strings.Replace(execution.StateJSON, current, strings.Repeat("0", len(current)), 1)
	if err := db.Model(&model.CloudAgentExecution{}).Where("id = ?", root.ID).
		Update("state_json", stale).Error; err != nil {
		t.Fatal(err)
	}

	req := agentTestRequest()
	req.Prompt = "继续刚才的任务"
	req.IdempotencyKey = "contract-change-continuation"
	child, err := s.CreateCloudAgentRun("user", req, root.ID)
	if err != nil {
		t.Fatalf("contract change must not block the conversation: %v", err)
	}
	if child == nil || child.ID == "" || child.ID == root.ID {
		t.Fatalf("expected a new turn, got %#v", child)
	}

	// 历史必须继承，否则用户等于从零开始。
	task, err := s.repo.TaskForUser("user", child.ID)
	if err != nil {
		t.Fatal(err)
	}
	var input struct {
		TextHistory []providerTextMessage `json:"textHistory"`
	}
	if err := json.Unmarshal([]byte(task.InputJSON), &input); err != nil {
		t.Fatal(err)
	}
	if len(input.TextHistory) == 0 {
		t.Fatal("continuation must inherit conversation history")
	}

	// 无法续跑的旧轮应被归档为终态，避免调度器反复重试。
	archived, err := s.repo.CloudAgent("user", root.ID)
	if err != nil {
		t.Fatal(err)
	}
	if archived.Status == "running" || archived.Status == "queued" {
		t.Fatalf("superseded run must be archived, still %q", archived.Status)
	}
}
