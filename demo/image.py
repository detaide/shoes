import json
import os
from dashscope import MultiModalConversation
import dashscope

# 以下为中国（北京）地域url，若使用新加坡地域的模型，需将url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'

# 模型支持输入1-3张图片
messages = [
    {
        "role": "user",
        "content": [
            {"image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260310/rdsgaa/image+%2815%29.png"},
            {"image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260310/qokhtl/image+%2816%29.png"},
            {"text": "使用图一的城市照片作为底图。请勿更改照片中的真实建筑、街道、车辆或人物。保持照片的真实性。三个图二中的卡通形象在建筑物周围，一个趴在建筑物上方，一个从建筑物的右边探出头来，一个坐在建筑物前的空地上。该形象应采用扁平化的图形风格绘制，轮廓清晰，类似于壁画或海报插图。"}
        ]
    }
]

# 千问 API Key 从环境变量读取,严禁硬编码:
#   export DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxx
# 获取:https://help.aliyun.com/zh/model-studio/get-api-key
api_key = os.getenv("DASHSCOPE_API_KEY", "")
if not api_key:
    raise RuntimeError("未设置环境变量 DASHSCOPE_API_KEY")

# qwen-image-2.0系列、qwen-image-edit-max、qwen-image-edit-plus系列支持输出1-6张图片
response = MultiModalConversation.call(
    api_key=api_key,
    model="qwen-image-2.0-pro-2026-04-22",
    messages=messages,
    stream=False,
    n=1,
    watermark=False,
    negative_prompt=" ",
    prompt_extend=True,
    size="2048*2048",
)

if response.status_code == 200:
    # 如需查看完整响应，请取消下行注释
    # print(json.dumps(response, ensure_ascii=False))
    for i, content in enumerate(response.output.choices[0].message.content):
        print(f"输出图像{i+1}的URL:{content['image']}")
else:
    print(f"HTTP返回码：{response.status_code}")
    print(f"错误码：{response.code}")
    print(f"错误信息：{response.message}")
    print("请参考文档：https://help.aliyun.com/zh/model-studio/error-code")