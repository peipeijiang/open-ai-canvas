# X-MiniMaxH3 接口说明

## 鉴权

`Authorization: Bearer <API Key>`

## 创建任务

POST `http://152.136.42.128:8190/v1/video/generateVideo`

```json
{
  "model": "h3-fl-turbo",
  "prompt": "以图片为起始画面，镜头自然运动，主体保持连贯。",
  "duration": 5,
  "resolution": "720p",
  "metadata": { "ratio": "9:16" },
  "media": { "firstFrame": "https://example.com/first.jpg" }
}
```

多参考模型改用素材数组：

```json
{
  "model": "h3-ref-turbo",
  "prompt": "参考图片中的主体外观，生成自然连贯的短片。",
  "duration": 8,
  "resolution": "720p",
  "metadata": { "ratio": "9:16" },
  "media": {
    "images": ["https://example.com/ref.jpg"],
    "videos": [],
    "audios": []
  }
}
```

成功受理返回 HTTP 202：

```json
{ "data": "<task-id>", "id": "<task-id>", "state": "WAITING", "priority": 0 }
```

## 查询任务

POST `http://152.136.42.128:8190/v1/video/getVideoStatus`

```json
{ "taskICode": "<task-id>" }
```

状态：`queued` / `running` / `success` / `failed`。成功时视频地址位于 `data.data`，失败原因位于 `data.failReason`：

```json
{ "status": "success", "data": { "status": "success", "data": "http://152.136.42.128:8190/x-video/....mp4" } }
```

## 素材限制

- 图片 ≤ 9 张，视频 ≤ 3 段，音频 ≤ 3 段。
- 图片、视频、音频可使用公网 URL 或 `data:` 形式的 Data URI。
- 请求中的 `resolution` 字段不会改变输出分辨率，当前固定 720p。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "x-minimaxh3",
  "name": "X-MiniMaxH3 私有服务",
  "version": "1.0.0",
  "author": "shane",
  "description": "腾讯云自建 X-MiniMaxH3 视频生成协议插件（H3 Scheduler 异步任务，支持 Base / Turbo 与首尾帧、多参考）。",
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
        "id": "x-minimaxh3",
        "label": "X-MiniMaxH3 私有服务",
        "capabilities": [
          "video"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "http://152.136.42.128:8190",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "requiresPublicMediaUrls": true,
        "detachedPolling": true,
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "values": [
              "h3-fl-base",
              "h3-fl-turbo",
              "h3-ref-base",
              "h3-ref-turbo"
            ],
            "description": "模型 ID：h3-fl-base / h3-fl-turbo（文生、首尾帧），h3-ref-base / h3-ref-turbo（多参考）。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "视频提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "first/last/reference image",
            "description": "图片输入：首帧/尾帧用于 FL 模型，参考图用于 Ref 模型。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "reference video",
            "description": "参考视频，仅 Ref 模型读取。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "reference audio",
            "description": "参考音频，仅 Ref 模型读取。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "视频时长秒数（4-15）。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "metadata.ratio",
            "values": [
              "9:16",
              "16:9",
              "1:1"
            ],
            "description": "画幅比例。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "插件命名空间内的厂商扩展字段。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/video/generateVideo",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "model": {
              "$coalesce": [
                {
                  "$ref": "request.model"
                },
                "h3-fl-turbo"
              ]
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "duration": {
              "$coalesce": [
                {
                  "$ref": "request.duration"
                },
                5
              ]
            },
            "resolution": "720p",
            "metadata": {
              "ratio": {
                "$coalesce": [
                  {
                    "$ref": "request.aspectRatio"
                  },
                  "9:16"
                ]
              }
            },
            "media": {
              "$if": {
                "condition": {
                  "$in": [
                    {
                      "$ref": "request.model"
                    },
                    [
                      "h3-ref-base",
                      "h3-ref-turbo"
                    ]
                  ]
                },
                "then": {
                  "images": {
                    "$map": {
                      "from": {
                        "$ref": "request.images"
                      },
                      "as": "media",
                      "in": {
                        "$coalesce": [
                          {
                            "$ref": "media.url"
                          },
                          {
                            "$ref": "media.dataUrl"
                          }
                        ]
                      }
                    }
                  },
                  "videos": {
                    "$map": {
                      "from": {
                        "$ref": "request.videos"
                      },
                      "as": "media",
                      "in": {
                        "$coalesce": [
                          {
                            "$ref": "media.url"
                          },
                          {
                            "$ref": "media.dataUrl"
                          }
                        ]
                      }
                    }
                  },
                  "audios": {
                    "$map": {
                      "from": {
                        "$ref": "request.audios"
                      },
                      "as": "media",
                      "in": {
                        "$coalesce": [
                          {
                            "$ref": "media.url"
                          },
                          {
                            "$ref": "media.dataUrl"
                          }
                        ]
                      }
                    }
                  }
                },
                "else": {
                  "firstFrame": {
                    "$omitEmpty": {
                      "$first": {
                        "$map": {
                          "from": {
                            "$filter": {
                              "from": {
                                "$ref": "request.images"
                              },
                              "as": "media",
                              "where": {
                                "$eq": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "first_frame"
                                ]
                              }
                            }
                          },
                          "as": "media",
                          "in": {
                            "$coalesce": [
                              {
                                "$ref": "media.url"
                              },
                              {
                                "$ref": "media.dataUrl"
                              }
                            ]
                          }
                        }
                      }
                    }
                  },
                  "lastFrame": {
                    "$omitEmpty": {
                      "$first": {
                        "$map": {
                          "from": {
                            "$filter": {
                              "from": {
                                "$ref": "request.images"
                              },
                              "as": "media",
                              "where": {
                                "$eq": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "last_frame"
                                ]
                              }
                            }
                          },
                          "as": "media",
                          "in": {
                            "$coalesce": [
                              {
                                "$ref": "media.url"
                              },
                              {
                                "$ref": "media.dataUrl"
                              }
                            ]
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "poll": {
          "method": "POST",
          "path": "/v1/video/getVideoStatus",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "taskICode": {
              "$ref": "taskId"
            }
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.data"
              },
              {
                "$ref": "response.id"
              },
              {
                "$ref": "response.task_id"
              }
            ]
          },
          "status": {
            "$coalesce": [
              {
                "$ref": "response.data.status"
              },
              {
                "$ref": "response.status"
              },
              {
                "$ref": "response.state"
              },
              "pending"
            ]
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.data.failReason"
              },
              {
                "$ref": "response.error.message"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$coalesce": [
              {
                "$ref": "response.data.data"
              },
              {
                "$ref": "response.data.videoUrl"
              },
              {
                "$ref": "response.data.video_url"
              }
            ]
          },
          "errorPaths": [
            "data.failReason",
            "error.message"
          ],
          "resultEphemeral": true,
          "messagePaths": [
            "data.failReason",
            "error.message"
          ]
        },
        "validations": [
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.model"
                },
                [
                  "h3-fl-base",
                  "h3-fl-turbo",
                  "h3-ref-base",
                  "h3-ref-turbo"
                ]
              ]
            },
            "message": "X-MiniMaxH3 模型必须为 h3-fl-base / h3-fl-turbo / h3-ref-base / h3-ref-turbo"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                },
                9
              ]
            },
            "message": "X-MiniMaxH3 最多支持 9 张图片"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.videos"
                  }
                },
                3
              ]
            },
            "message": "X-MiniMaxH3 最多支持 3 段参考视频"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.audios"
                  }
                },
                3
              ]
            },
            "message": "X-MiniMaxH3 最多支持 3 段参考音频"
          }
        ]
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
