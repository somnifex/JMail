#!/usr/bin/env python3
"""
JMail 启动脚本
"""
import asyncio
import sys
import os

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import app
from app.core.config import get_settings

settings = get_settings()

if __name__ == "__main__":
    import uvicorn

    print(f"""
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   JMail - 轻量邮件管理系统                          ║
║                                                        ║
║   版本: {settings.APP_VERSION}
║   调试模式: {'开启' if settings.DEBUG else '关闭'}
║                                                        ║
║   访问地址: http://{settings.HOST}:{settings.PORT}
║                                                        ║
╚════════════════════════════════════════════════════════╝
""")

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info"
    )
