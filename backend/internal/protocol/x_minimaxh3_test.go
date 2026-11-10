package protocol

import (
	"context"
	"testing"
)

func TestXMiniMaxH3FirstLastFrameRequest(t *testing.T) {
	adapter := officialPackageAdapter(t, "x-minimaxh3.yingce-plugin", "x-minimaxh3")
	spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
		Model:       "h3-fl-turbo",
		Prompt:      "the character walks forward",
		Duration:    6,
		AspectRatio: "16:9",
		Images: []MediaReference{
			{URL: "https://example.com/first.jpg", Role: "first_frame"},
			{URL: "https://example.com/last.jpg", Role: "last_frame"},
		},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if spec.Method != "POST" || spec.Path != "/v1/video/generateVideo" || !spec.OriginPath {
		t.Fatalf("create = %s %s origin=%v", spec.Method, spec.Path, spec.OriginPath)
	}
	body := manifestTestBody(t, spec)
	if body["model"] != "h3-fl-turbo" || body["duration"] != float64(6) || body["resolution"] != "720p" {
		t.Fatalf("create body = %#v", body)
	}
	metadata, _ := body["metadata"].(map[string]any)
	if metadata["ratio"] != "16:9" {
		t.Fatalf("ratio = %#v", metadata["ratio"])
	}
	media, _ := body["media"].(map[string]any)
	if media["firstFrame"] != "https://example.com/first.jpg" || media["lastFrame"] != "https://example.com/last.jpg" {
		t.Fatalf("media = %#v", media)
	}
	if _, ok := media["images"]; ok {
		t.Fatalf("first/last frame media must not carry reference arrays: %#v", media)
	}
}

func TestXMiniMaxH3ReferenceRequest(t *testing.T) {
	adapter := officialPackageAdapter(t, "x-minimaxh3.yingce-plugin", "x-minimaxh3")
	spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
		Model:    "h3-ref-base",
		Prompt:   "keep the subject identity",
		Duration: 8,
		Images:   []MediaReference{{URL: "https://example.com/ref.jpg", Role: "reference_image"}},
		Videos:   []MediaReference{{URL: "https://example.com/ref.mp4"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	media, _ := manifestTestBody(t, spec)["media"].(map[string]any)
	images, _ := media["images"].([]any)
	if len(images) != 1 || images[0] != "https://example.com/ref.jpg" {
		t.Fatalf("reference images = %#v", media["images"])
	}
	videos, _ := media["videos"].([]any)
	if len(videos) != 1 || videos[0] != "https://example.com/ref.mp4" {
		t.Fatalf("reference videos = %#v", media["videos"])
	}
	if _, ok := media["firstFrame"]; ok {
		t.Fatalf("reference media must not carry first frame: %#v", media)
	}
}

func TestXMiniMaxH3PollAndParsing(t *testing.T) {
	adapter := officialPackageAdapter(t, "x-minimaxh3.yingce-plugin", "x-minimaxh3")
	ctx := context.Background()

	poll, err := adapter.BuildPoll(ctx, PollContext{Model: "h3-fl-turbo", TaskID: "task-1"})
	if err != nil {
		t.Fatal(err)
	}
	if poll.Method != "POST" || poll.Path != "/v1/video/getVideoStatus" || !poll.OriginPath {
		t.Fatalf("poll = %s %s origin=%v", poll.Method, poll.Path, poll.OriginPath)
	}
	if code := manifestTestBody(t, poll)["taskICode"]; code != "task-1" {
		t.Fatalf("taskICode = %#v", code)
	}

	created, err := adapter.ParseCreate(ctx, []byte(`{"data":"task-1","id":"task-1","state":"WAITING","priority":0}`))
	if err != nil {
		t.Fatal(err)
	}
	if created.TaskID != "task-1" || created.Status != StatusPending {
		t.Fatalf("created = %#v", created)
	}

	done, err := adapter.ParsePoll(ctx, PollContext{TaskID: "task-1"}, []byte(`{"status":"success","data":{"status":"success","data":"https://cdn.example.com/out.mp4"}}`))
	if err != nil {
		t.Fatal(err)
	}
	if done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Videos) != 1 || done.Result.Videos[0].URL != "https://cdn.example.com/out.mp4" {
		t.Fatalf("done = %#v", done)
	}

	failed, err := adapter.ParsePoll(ctx, PollContext{TaskID: "task-2"}, []byte(`{"status":"failed","data":{"status":"failed","failReason":"engine switch failed"}}`))
	if err != nil {
		t.Fatal(err)
	}
	if failed.Status != StatusFailed || failed.Message != "engine switch failed" {
		t.Fatalf("failed = %#v", failed)
	}
}
