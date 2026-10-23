package app

import "testing"

// 复现：canvas_inspect_image 看图后下一次模型调用报「模型协议引用了未获准的图片」。
func TestCloudAgentPiStepImageReferencesSatisfyPlaceholderPreflight(t *testing.T) {
	s, _, _ := cloudAgentVisionFixture(t)
	state := cloudAgentRuntime{Request: agentTestRequest()}
	state.Request.VisionEnabled = true
	call := cloudAgentStoryboardCall(t, "canvas_inspect_image", "inspect-cat", map[string]any{"nodeId": "cat"})
	result, err := s.prepareCloudAgentImageInspection("user", "agent-canvas", &state, call)
	if err != nil {
		t.Fatal(err)
	}
	history := []map[string]any{
		{"role": "user", "content": "参考左侧素材"},
		{"role": "user", "content": cloudAgentImageContentParts(result.(cloudAgentImageInspection))},
	}

	// 不带清单时预检拒绝，复现修复前的失败。
	bare := canonicalAgentRequest{ToolChoice: "auto", Messages: history}
	if err := validateAgentResourcePlaceholders(canvasGenerationInput{Mode: "text", AgentRequests: &agentToolRequests{Canonical: &bare}}); err == nil {
		t.Fatal("placeholder without approved references passed preflight")
	}

	canonical := canonicalAgentRequest{ToolChoice: "auto", Messages: history}
	references, err := s.cloudAgentPiStepImageReferences("user", state.Request, &canonical)
	if err != nil {
		t.Fatal(err)
	}
	if len(references) != 1 {
		t.Fatalf("references = %#v, want the inspected image", references)
	}
	input := canvasGenerationInput{Mode: "text", ReferenceImages: references, AgentRequests: &agentToolRequests{Canonical: &canonical}}
	if err := validateAgentResourcePlaceholders(input); err != nil {
		t.Fatalf("preflight still rejects the inspected image: %v", err)
	}

	// 没有图片的历史不产生清单，也不报错。
	plain := canonicalAgentRequest{ToolChoice: "auto", Messages: history[:1]}
	if refs, err := s.cloudAgentPiStepImageReferences("user", state.Request, &plain); err != nil || len(refs) != 0 {
		t.Fatalf("text-only history: refs=%#v err=%v", refs, err)
	}
}

func TestCloudAgentPiModelStepAppendsBufferedImagesAfterProjection(t *testing.T) {
	state := cloudAgentRuntime{}
	// Production Pi sessions usually have a longer runtime transcript than the
	// persisted canonical history. That exact shape used to project away the
	// buffered image even though the equal-length unit fixture passed.
	state.Canonical.Messages = []map[string]any{{"role": "user", "content": "请核对参考图"}}
	cloudAgentStageImageInspection(&state, cloudAgentImageInspection{
		Receipt:  map[string]any{"nodeId": "cat", "title": "参考图"},
		ImageURL: "resource:ref-one",
	})

	canonical, err := cloudAgentPiCanonicalForModelStep(
		[]map[string]any{
			{"role": "user", "content": "请核对参考图"},
			{"role": "assistant", "content": "我先查看画面"},
			{"role": "user", "content": "工具回执已写入"},
		},
		&state,
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(state.PendingImageInspections) != 0 {
		t.Fatalf("buffered image was not flushed: %#v", state.PendingImageInspections)
	}
	if len(canonical.Messages) != 4 || cloudAgentMessageImagePartCount(canonical.Messages[3]) != 1 {
		t.Fatalf("projected request lost the buffered image: %#v", canonical.Messages)
	}
	parts, ok := canonical.Messages[3]["content"].([]any)
	if !ok || len(parts) != 2 {
		t.Fatalf("flushed image content is malformed: %#v", canonical.Messages[3])
	}
	image, _ := parts[1].(map[string]any)["image_url"].(map[string]any)
	if stringField(image, "url") != "resource:ref-one" {
		t.Fatalf("flushed image placeholder = %#v", image)
	}
}
