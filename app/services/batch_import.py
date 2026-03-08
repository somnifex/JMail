"""
批量导入服务 - 支持 CSV/JSON 格式批量导入邮箱账户
"""
import csv
import json
import io
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass

from app.models.schemas import MailboxCreate


@dataclass
class ImportResult:
    """导入结果"""
    success: bool
    total: int
    imported: int
    failed: int
    errors: List[Dict[str, Any]]
    data: List[Dict[str, Any]]


class BatchImportService:
    """批量导入服务"""

    # CSV 文件期望的列名
    CSV_COLUMNS = [
        'email',           # 邮箱地址
        'name',            # 显示名称
        'imap_server',     # IMAP 服务器
        'imap_port',       # IMAP 端口
        'imap_username',   # IMAP 用户名
        'imap_password',   # IMAP 密码
        'imap_use_ssl',    # IMAP 使用 SSL (true/false)
        'smtp_server',     # SMTP 服务器
        'smtp_port',       # SMTP 端口
        'smtp_username',   # SMTP 用户名
        'smtp_password',   # SMTP 密码
        'smtp_use_ssl',    # SMTP 使用 SSL (true/false)
        'smtp_use_tls',    # SMTP 使用 TLS (true/false)
        'use_oauth',       # 使用 OAuth (true/false)
        'oauth_provider',  # OAuth 提供商
        'fetch_interval',  # 收信间隔（秒）
    ]

    @classmethod
    def validate_csv_format(cls, content: str) -> Tuple[bool, List[str]]:
        """验证 CSV 文件格式"""
        errors = []

        try:
            reader = csv.DictReader(io.StringIO(content))
            headers = reader.fieldnames or []

            # 检查必需字段
            required_fields = ['email', 'imap_server', 'smtp_server']
            missing_fields = [f for f in required_fields if f not in headers]

            if missing_fields:
                errors.append(f"缺少必需字段: {', '.join(missing_fields)}")

            # 检查是否有数据行
            rows = list(reader)
            if not rows:
                errors.append("CSV 文件没有数据行")

        except csv.Error as e:
            errors.append(f"CSV 解析错误: {str(e)}")
        except Exception as e:
            errors.append(f"验证错误: {str(e)}")

        return len(errors) == 0, errors

    @classmethod
    def import_from_csv(cls, content: str, user_id: int) -> ImportResult:
        """从 CSV 导入邮箱账户"""
        errors = []
        imported_data = []
        total = 0
        imported = 0

        try:
            reader = csv.DictReader(io.StringIO(content))
            rows = list(reader)
            total = len(rows)

            for idx, row in enumerate(rows, start=1):
                try:
                    # 数据转换
                    mailbox_data = cls._convert_csv_row_to_mailbox(row)
                    mailbox_data['user_id'] = user_id

                    imported_data.append(mailbox_data)
                    imported += 1

                except Exception as e:
                    errors.append({
                        'row': idx,
                        'email': row.get('email', 'unknown'),
                        'error': str(e)
                    })

        except Exception as e:
            errors.append({
                'row': 0,
                'email': 'unknown',
                'error': f"CSV 解析失败: {str(e)}"
            })

        return ImportResult(
            success=len(errors) == 0,
            total=total,
            imported=imported,
            failed=len(errors),
            errors=errors,
            data=imported_data
        )

    @classmethod
    def import_from_json(cls, content: str, user_id: int) -> ImportResult:
        """从 JSON 导入邮箱账户"""
        errors = []
        imported_data = []

        try:
            data = json.loads(content)

            # 支持两种格式：对象数组或包含 mailboxes 字段的对象
            if isinstance(data, list):
                mailboxes = data
            elif isinstance(data, dict) and 'mailboxes' in data:
                mailboxes = data['mailboxes']
            else:
                raise ValueError("JSON 格式不正确，应为邮箱对象数组或包含 mailboxes 字段的对象")

            total = len(mailboxes)

            for idx, mailbox in enumerate(mailboxes, start=1):
                try:
                    # 验证必需字段
                    if 'email' not in mailbox:
                        raise ValueError("缺少必需字段: email")

                    mailbox['user_id'] = user_id
                    imported_data.append(mailbox)

                except Exception as e:
                    errors.append({
                        'row': idx,
                        'email': mailbox.get('email', 'unknown'),
                        'error': str(e)
                    })

            imported = len(imported_data)

            return ImportResult(
                success=len(errors) == 0,
                total=total,
                imported=imported,
                failed=len(errors),
                errors=errors,
                data=imported_data
            )

        except json.JSONDecodeError as e:
            return ImportResult(
                success=False,
                total=0,
                imported=0,
                failed=1,
                errors=[{'row': 0, 'email': 'unknown', 'error': f'JSON 解析错误: {str(e)}'}],
                data=[]
            )
        except Exception as e:
            return ImportResult(
                success=False,
                total=0,
                imported=0,
                failed=1,
                errors=[{'row': 0, 'email': 'unknown', 'error': str(e)}],
                data=[]
            )

    @classmethod
    def _convert_csv_row_to_mailbox(cls, row: Dict[str, str]) -> Dict[str, Any]:
        """将 CSV 行转换为邮箱数据"""
        data = {
            'email': row.get('email', '').strip(),
            'name': row.get('name', '').strip() or row.get('email', '').split('@')[0],
            'imap_server': row.get('imap_server', '').strip(),
            'imap_port': int(row.get('imap_port', 993)),
            'imap_username': row.get('imap_username', '').strip() or row.get('email', '').strip(),
            'imap_password': row.get('imap_password', ''),
            'imap_use_ssl': row.get('imap_use_ssl', 'true').lower() in ('true', '1', 'yes', 'on'),
            'smtp_server': row.get('smtp_server', '').strip(),
            'smtp_port': int(row.get('smtp_port', 587)),
            'smtp_username': row.get('smtp_username', '').strip() or row.get('email', '').strip(),
            'smtp_password': row.get('smtp_password', ''),
            'smtp_use_ssl': row.get('smtp_use_ssl', 'false').lower() in ('true', '1', 'yes', 'on'),
            'smtp_use_tls': row.get('smtp_use_tls', 'true').lower() in ('true', '1', 'yes', 'on'),
            'use_oauth': row.get('use_oauth', 'false').lower() in ('true', '1', 'yes', 'on'),
            'oauth_provider': row.get('oauth_provider', '').strip() or None,
            'fetch_interval': int(row.get('fetch_interval', 300)),
        }

        # 验证必需字段
        if not data['email']:
            raise ValueError("邮箱地址不能为空")

        if not data['use_oauth']:
            if not data['imap_server']:
                raise ValueError("非 OAuth 模式下 IMAP 服务器不能为空")
            if not data['smtp_server']:
                raise ValueError("非 OAuth 模式下 SMTP 服务器不能为空")

        return data

    @classmethod
    def generate_csv_template(cls) -> str:
        """生成 CSV 模板内容"""
        headers = ','.join(cls.CSV_COLUMNS)

        # 示例数据
        example = '''
example@gmail.com,My Gmail,imap.gmail.com,993,user@gmail.com,password,true,smtp.gmail.com,587,user@gmail.com,password,false,true,false,,300
example@outlook.com,My Outlook,outlook.office365.com,993,user@outlook.com,password,true,smtp.office365.com,587,user@outlook.com,password,false,true,true,microsoft,300'''

        return headers + example

    @classmethod
    def generate_json_template(cls) -> str:
        """生成 JSON 模板内容"""
        template = {
            "mailboxes": [
                {
                    "email": "example@gmail.com",
                    "name": "My Gmail",
                    "imap_server": "imap.gmail.com",
                    "imap_port": 993,
                    "imap_username": "user@gmail.com",
                    "imap_password": "password",
                    "imap_use_ssl": True,
                    "smtp_server": "smtp.gmail.com",
                    "smtp_port": 587,
                    "smtp_username": "user@gmail.com",
                    "smtp_password": "password",
                    "smtp_use_tls": True,
                    "fetch_interval": 300
                }
            ]
        }

        return json.dumps(template, indent=2, ensure_ascii=False)
