# Updrama 音乐与配音 接口字段

## 协议身份

- 插件 ID：`updrama-audio`。
- Provider ID：`updrama-suno-v6`（音乐 / 歌曲）、`updrama-gem-tts`（配音）。
- 能力：`audio`。
- 默认 Base URL：`https://api.lk888.ai`。
- 鉴权驱动：`bearer`。
- 创建：`POST /v1/media/generate`（`originPath: true`，路径直接拼在渠道 origin 上）。
- 查询：`GET /v1/media/status?task_id=...`（`originPath: true`）。
- 取消：上游未提供取消接口。

## 配置字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `apiKey` | secret | 是 | API Key |

## 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model` | 上游模型 ID。`updrama-suno-v6` 只接受 `suno-v6`；`updrama-gem-tts` 接受 `gem-2.5-tts`、`gem-3.1-tts`。 |
| `prompt` | string | 是 | `prompt` | Suno：音乐风格描述，最多 1000 字符；GEM-TTS：配音文本，可用自然语言指定语气与情绪。 |
| `providerOptions` | object | 否 | `params` | 仅使用本协议命名空间中的上游参数。 |

## 上游请求模板逐字段清单

### updrama-suno-v6

| 上游位置 | 值或转换表达式 |
| --- | --- |
| `create.method` | `"POST"` |
| `create.path` | `"/v1/media/generate"` |
| `create.contentType` | `"application/json"` |
| `create.body.model` | `{"$ref":"request.model"}` |
| `create.body.prompt` | `{"$ref":"request.prompt"}` |
| `create.body.params.mv` | `{"$coalesce":[{"$ref":"request.providerOptions.updrama-suno-v6.mv"},"v6"]}` |
| `create.body.params.lyrics` | `{"$omitEmpty":{"$ref":"request.providerOptions.updrama-suno-v6.lyrics"}}` |
| `create.body.params.make_instrumental` | `{"$coalesce":[{"$ref":"request.providerOptions.updrama-suno-v6.make_instrumental"},"song"]}` |
| `create.body.params.vocal_gender` | `{"$coalesce":[{"$ref":"request.providerOptions.updrama-suno-v6.vocal_gender"},"auto"]}` |
| `poll.method` | `"GET"` |
| `poll.path` | `"/v1/media/status"` |
| `poll.query.task_id` | `{"$ref":"taskId"}` |

校验：`model` 必须等于 `suno-v6`；`prompt` 不超过 1000 字符；`lyrics` 不超过 5000 字符。

### updrama-gem-tts

| 上游位置 | 值或转换表达式 |
| --- | --- |
| `create.method` | `"POST"` |
| `create.path` | `"/v1/media/generate"` |
| `create.contentType` | `"application/json"` |
| `create.body.model` | `{"$ref":"request.model"}` |
| `create.body.prompt` | 有 `request.extra.audioInstructions` 时为 `audioInstructions + "\n" + prompt`，否则为 `request.prompt` |
| `create.body.params.model_version` | `{"$coalesce":[{"$ref":"request.providerOptions.updrama-gem-tts.model_version"},"pro"]}` |
| `create.body.params.voice_id` | 优先 `providerOptions.updrama-gem-tts.voice_id`；其次 `request.extra.audioVoice`（为空或 `alloy` 时改用 `Zephyr`） |
| `poll.method` | `"GET"` |
| `poll.path` | `"/v1/media/status"` |
| `poll.query.task_id` | `{"$ref":"taskId"}` |

校验：`model` 必须是 `gem-2.5-tts` 或 `gem-3.1-tts`；`model_version` 必须是 `pro` 或 `flash`。只提供预置音色，不提供声音克隆。

## Provider 扩展键

- `providerOptions.updrama-suno-v6.lyrics`
- `providerOptions.updrama-suno-v6.make_instrumental`
- `providerOptions.updrama-suno-v6.mv`
- `providerOptions.updrama-suno-v6.vocal_gender`
- `providerOptions.updrama-gem-tts.model_version`
- `providerOptions.updrama-gem-tts.voice_id`

## 响应映射逐字段清单

两个 Provider 使用相同的响应映射。

| 映射位置 | 上游路径或转换表达式 |
| --- | --- |
| `response.taskId` | `response.task_id` → `response.data.task_id` → 宿主按 `taskIdPaths` 提取的任务 ID |
| `response.taskIdPaths` | `task_id`、`taskId`、`taskID`、`id`、`data.task_id`、`data.taskId`、`data.taskID`、`data.id`、`data.task.id`、`data.result.task_id`、`data.result.taskId`、`result.task_id`、`result.taskId` |
| `response.status` | 读取 `state`（或 `data.state`，缺省 `pending`）：`success` → `succeeded`，`failed` → `failed`，`running` → `processing`，`pending` 及其他 → `pending` |
| `response.statusPaths` | `state`、`data.state`、`status`、`data.status` |
| `response.message` | `error.message` → `error` → `error.msg` → `message` → `msg` |
| `response.audios` | `result_url` → `data.result_url` → `audio_url` → `data.audio_url` → `result_urls` → `data.result_urls` |
| `response.resultKind` | `"audio"` |
| `response.resultEphemeral` | `true` |
| `response.errorPaths` | `error.code`、`error.type` |

## 响应与错误

任务状态只读取 `state`；上游中文 `status` 仅用于显示，不参与成功判定。音频结果 URL 标记为 ephemeral，由宿主立即下载持久化。HTTP 错误、`state=failed` 和 error object 保持失败语义，不包装成成功。

## 兼容边界

该包只对应 https://up.lk888.ai/apidoc 的统一异步媒体 API（`/v1/media/generate` + `/v1/media/status`）。目录可用和离线协议测试通过，不代表收费生成已经验收。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "updrama-audio",
  "name": "Updrama 音乐与配音",
  "version": "1.0.2",
  "author": "Local deployment",
  "description": "按 updrama 文档适配 Suno v6 音乐与 GEM-2.5-TTS 配音的统一异步媒体 API。",
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "API Key",
        "required": true
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "updrama-suno-v6",
        "label": "Suno v6 音乐 / 歌曲",
        "capabilities": [
          "audio"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://api.lk888.ai",
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "上游模型 ID"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "音乐风格描述，歌词通过 providerOptions.updrama-suno-v6.lyrics 传入。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "params",
            "description": "仅使用本协议命名空间中的上游参数"
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "suno-v6"
              ]
            },
            "message": "此协议只接受 suno-v6。"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.prompt"
                  }
                },
                1000
              ]
            },
            "message": "Suno 风格描述最多 1000 字符；歌词请放入 lyrics。"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$coalesce": [
                      {
                        "$ref": "request.providerOptions.updrama-suno-v6.lyrics"
                      },
                      ""
                    ]
                  }
                },
                5000
              ]
            },
            "message": "Suno 歌词最多 5000 字符。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/media/generate",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "params": {
              "mv": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.updrama-suno-v6.mv"
                  },
                  "v6"
                ]
              },
              "lyrics": {
                "$omitEmpty": {
                  "$ref": "request.providerOptions.updrama-suno-v6.lyrics"
                }
              },
              "make_instrumental": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.updrama-suno-v6.make_instrumental"
                  },
                  "song"
                ]
              },
              "vocal_gender": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.updrama-suno-v6.vocal_gender"
                  },
                  "auto"
                ]
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/media/status",
          "originPath": true,
          "query": {
            "task_id": {
              "$ref": "taskId"
            }
          }
        },
        "response": {
          "taskIdPaths": [
            "task_id",
            "taskId",
            "taskID",
            "id",
            "data.task_id",
            "data.taskId",
            "data.taskID",
            "data.id",
            "data.task.id",
            "data.result.task_id",
            "data.result.taskId",
            "result.task_id",
            "result.taskId"
          ],
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "response.data.task_id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$switch": {
              "cases": [
                {
                  "when": {
                    "$eq": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "response.state"
                          },
                          {
                            "$ref": "response.data.state"
                          },
                          "pending"
                        ]
                      },
                      "success"
                    ]
                  },
                  "then": "succeeded"
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "response.state"
                          },
                          {
                            "$ref": "response.data.state"
                          },
                          "pending"
                        ]
                      },
                      "failed"
                    ]
                  },
                  "then": "failed"
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "response.state"
                          },
                          {
                            "$ref": "response.data.state"
                          },
                          "pending"
                        ]
                      },
                      "running"
                    ]
                  },
                  "then": "processing"
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "response.state"
                          },
                          {
                            "$ref": "response.data.state"
                          },
                          "pending"
                        ]
                      },
                      "pending"
                    ]
                  },
                  "then": "pending"
                }
              ],
              "default": "pending"
            }
          },
          "statusPaths": [
            "state",
            "data.state",
            "status",
            "data.status"
          ],
          "message": {
            "$coalesce": [
              {
                "$ref": "response.error.message"
              },
              {
                "$ref": "response.error"
              },
              {
                "$ref": "response.error.message"
              },
              {
                "$ref": "response.error.msg"
              },
              {
                "$ref": "response.message"
              },
              {
                "$ref": "response.msg"
              }
            ]
          },
          "audios": {
            "$coalesce": [
              {
                "$ref": "response.result_url"
              },
              {
                "$ref": "response.data.result_url"
              },
              {
                "$ref": "response.audio_url"
              },
              {
                "$ref": "response.data.audio_url"
              },
              {
                "$ref": "response.result_urls"
              },
              {
                "$ref": "response.data.result_urls"
              }
            ]
          },
          "resultKind": "audio",
          "resultEphemeral": true,
          "errorPaths": [
            "error.code",
            "error.type"
          ]
        }
      },
      {
        "id": "updrama-gem-tts",
        "label": "GEM-2.5-TTS 配音",
        "capabilities": [
          "audio"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://api.lk888.ai",
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "上游模型 ID"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "配音文本，可通过自然语言指定语气与情绪。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "params",
            "description": "仅使用本协议命名空间中的上游参数"
          }
        ],
        "validations": [
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.model"
                },
                [
                  "gem-2.5-tts",
                  "gem-3.1-tts"
                ]
              ]
            },
            "message": "此协议仅支持 gem-2.5-tts 与 gem-3.1-tts。"
          },
          {
            "assert": {
              "$in": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.providerOptions.updrama-gem-tts.model_version"
                    },
                    "pro"
                  ]
                },
                [
                  "pro",
                  "flash"
                ]
              ]
            },
            "message": "GEM-TTS model_version 必须为 pro 或 flash。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/media/generate",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$if": {
                "condition": {
                  "$ref": "request.extra.audioInstructions"
                },
                "then": {
                  "$concat": [
                    {
                      "$ref": "request.extra.audioInstructions"
                    },
                    "\n",
                    {
                      "$ref": "request.prompt"
                    }
                  ]
                },
                "else": {
                  "$ref": "request.prompt"
                }
              }
            },
            "params": {
              "model_version": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.updrama-gem-tts.model_version"
                  },
                  "pro"
                ]
              },
              "voice_id": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.updrama-gem-tts.voice_id"
                  },
                  {
                    "$if": {
                      "condition": {
                        "$in": [
                          {
                            "$coalesce": [
                              {
                                "$ref": "request.extra.audioVoice"
                              },
                              ""
                            ]
                          },
                          [
                            "",
                            "alloy"
                          ]
                        ]
                      },
                      "then": "Zephyr",
                      "else": {
                        "$ref": "request.extra.audioVoice"
                      }
                    }
                  }
                ]
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/media/status",
          "originPath": true,
          "query": {
            "task_id": {
              "$ref": "taskId"
            }
          }
        },
        "response": {
          "taskIdPaths": [
            "task_id",
            "taskId",
            "taskID",
            "id",
            "data.task_id",
            "data.taskId",
            "data.taskID",
            "data.id",
            "data.task.id",
            "data.result.task_id",
            "data.result.taskId",
            "result.task_id",
            "result.taskId"
          ],
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "response.data.task_id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$switch": {
              "cases": [
                {
                  "when": {
                    "$eq": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "response.state"
                          },
                          {
                            "$ref": "response.data.state"
                          },
                          "pending"
                        ]
                      },
                      "success"
                    ]
                  },
                  "then": "succeeded"
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "response.state"
                          },
                          {
                            "$ref": "response.data.state"
                          },
                          "pending"
                        ]
                      },
                      "failed"
                    ]
                  },
                  "then": "failed"
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "response.state"
                          },
                          {
                            "$ref": "response.data.state"
                          },
                          "pending"
                        ]
                      },
                      "running"
                    ]
                  },
                  "then": "processing"
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "response.state"
                          },
                          {
                            "$ref": "response.data.state"
                          },
                          "pending"
                        ]
                      },
                      "pending"
                    ]
                  },
                  "then": "pending"
                }
              ],
              "default": "pending"
            }
          },
          "statusPaths": [
            "state",
            "data.state",
            "status",
            "data.status"
          ],
          "message": {
            "$coalesce": [
              {
                "$ref": "response.error.message"
              },
              {
                "$ref": "response.error"
              },
              {
                "$ref": "response.error.message"
              },
              {
                "$ref": "response.error.msg"
              },
              {
                "$ref": "response.message"
              },
              {
                "$ref": "response.msg"
              }
            ]
          },
          "audios": {
            "$coalesce": [
              {
                "$ref": "response.result_url"
              },
              {
                "$ref": "response.data.result_url"
              },
              {
                "$ref": "response.audio_url"
              },
              {
                "$ref": "response.data.audio_url"
              },
              {
                "$ref": "response.result_urls"
              },
              {
                "$ref": "response.data.result_urls"
              }
            ]
          },
          "resultKind": "audio",
          "resultEphemeral": true,
          "errorPaths": [
            "error.code",
            "error.type"
          ]
        }
      }
    ]
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
