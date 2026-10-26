package protocol

import (
	"context"
	"os"
	"strings"
	"testing"
)

func updramaAudioAdapters(t *testing.T) map[string]Adapter {
	t.Helper()
	data, err := os.ReadFile("../../../plugin-packages/updrama-audio/manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := LoadInstalledProviders(data, nil)
	if err != nil {
		t.Fatal(err)
	}
	result := map[string]Adapter{}
	for _, adapter := range adapters {
		result[adapter.Metadata().ID] = adapter
	}
	if len(result) != 2 {
		t.Fatalf("providers = %v", result)
	}
	return result
}

func TestUpdramaAudioRequests(t *testing.T) {
	adapters := updramaAudioAdapters(t)
	for _, tc := range []struct {
		id, model, prompt string
		extra             map[string]any
		options           map[string]map[string]any
		wantPrompt        string
		params            map[string]any
	}{
		{"updrama-suno-v6", "suno-v6", "cinematic strings", nil, map[string]map[string]any{"updrama-suno-v6": {"lyrics": "hello", "mv": "v6-mini", "make_instrumental": "song", "vocal_gender": "f"}}, "cinematic strings", map[string]any{"lyrics": "hello", "mv": "v6-mini", "make_instrumental": "song", "vocal_gender": "f"}},
		{"updrama-gem-tts", "gem-2.5-tts", "Hello", map[string]any{"audioVoice": "Kore", "audioInstructions": "Speak softly"}, map[string]map[string]any{"updrama-gem-tts": {"model_version": "flash"}}, "Speak softly\nHello", map[string]any{"voice_id": "Kore", "model_version": "flash"}},
		{"updrama-gem-tts", "gem-2.5-tts", "Hello", map[string]any{"audioVoice": "alloy"}, nil, "Hello", map[string]any{"voice_id": "Zephyr", "model_version": "pro"}},
	} {
		t.Run(tc.model+tc.wantPrompt, func(t *testing.T) {
			spec, err := adapters[tc.id].BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Capability: CapabilityAudio, Model: tc.model, Prompt: tc.prompt, Extra: tc.extra, ProviderOptions: tc.options}})
			if err != nil {
				t.Fatal(err)
			}
			if spec.Method != "POST" || spec.Path != "/v1/media/generate" || !spec.OriginPath {
				t.Fatalf("create = %#v", spec)
			}
			body := manifestTestBody(t, spec)
			if body["model"] != tc.model || body["prompt"] != tc.wantPrompt {
				t.Fatalf("body = %#v", body)
			}
			params, _ := body["params"].(map[string]any)
			for key, want := range tc.params {
				if params[key] != want {
					t.Fatalf("params[%s] = %#v, want %#v", key, params[key], want)
				}
			}
		})
	}
}

func TestUpdramaAudioLifecycle(t *testing.T) {
	for id, adapter := range updramaAudioAdapters(t) {
		t.Run(id, func(t *testing.T) {
			created, err := adapter.ParseCreate(context.Background(), []byte(`{"task_id":123456,"state":"pending","status":"排队中"}`))
			if err != nil || created.TaskID != "123456" || created.Status != StatusPending {
				t.Fatalf("create = %#v, %v", created, err)
			}
			poll, err := adapter.BuildPoll(context.Background(), PollContext{TaskID: created.TaskID})
			if err != nil || poll.Method != "GET" || poll.Path != "/v1/media/status" || !poll.OriginPath || len(poll.Query["task_id"]) != 1 || poll.Query["task_id"][0] != "123456" {
				t.Fatalf("poll = %#v, %v", poll, err)
			}
			for _, tc := range []struct {
				body   string
				status Status
				audios int
			}{
				{`{"state":"running","status":"已完成"}`, StatusProcessing, 0},
				{`{"state":"success","status":"处理中","result_url":"https://media.example/one.mp3"}`, StatusSucceeded, 1},
				{`{"data":{"state":"success","result_url":["https://media.example/one.mp3","https://media.example/two.mp3"]}}`, StatusSucceeded, 2},
				{`{"state":"failed","error":"provider error","result_url":"https://media.example/stale.mp3"}`, StatusFailed, 1},
			} {
				result, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(tc.body))
				if err != nil || result.Status != tc.status || result.TaskID != created.TaskID {
					t.Fatalf("parse %s = %#v, %v", tc.body, result, err)
				}
				count := 0
				if result.Result != nil {
					count = len(result.Result.Audios)
				}
				if count != tc.audios {
					t.Fatalf("audios = %d, want %d", count, tc.audios)
				}
			}
		})
	}
}

func TestUpdramaAudioRejectsInvalidRequests(t *testing.T) {
	adapters := updramaAudioAdapters(t)
	for _, tc := range []struct {
		id      string
		request GenerationRequest
	}{
		{"updrama-suno-v6", GenerationRequest{Model: "wrong", Prompt: "music"}},
		{"updrama-suno-v6", GenerationRequest{Model: "suno-v6", Prompt: strings.Repeat("a", 1001)}},
		{"updrama-suno-v6", GenerationRequest{Model: "suno-v6", Prompt: "music", ProviderOptions: map[string]map[string]any{"updrama-suno-v6": {"lyrics": strings.Repeat("a", 5001)}}}},
		{"updrama-gem-tts", GenerationRequest{Model: "wrong", Prompt: "speech"}},
		{"updrama-gem-tts", GenerationRequest{Model: "gem-2.5-tts", Prompt: "speech", ProviderOptions: map[string]map[string]any{"updrama-gem-tts": {"model_version": "invalid"}}}},
	} {
		if _, err := adapters[tc.id].BuildCreate(context.Background(), RequestContext{Request: tc.request}); err == nil {
			t.Fatalf("accepted invalid request: %#v", tc.request)
		}
	}
}
