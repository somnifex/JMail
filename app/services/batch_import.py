import csv
import io
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple


@dataclass
class ImportResult:
    success: bool
    total: int
    imported: int
    failed: int
    errors: List[Dict[str, Any]]
    data: List[Dict[str, Any]]


class BatchImportService:
    CSV_COLUMNS = [
        'email',
        'name',
        'imap_server',
        'imap_port',
        'imap_username',
        'imap_password',
        'imap_use_ssl',
        'smtp_server',
        'smtp_port',
        'smtp_username',
        'smtp_password',
        'smtp_use_ssl',
        'smtp_use_tls',
        'use_oauth',
        'oauth_provider',
        'fetch_interval',
    ]

    @classmethod
    def validate_csv_format(cls, content: str) -> Tuple[bool, List[str]]:
        errors: List[str] = []

        try:
            reader = csv.DictReader(io.StringIO(content))
            headers = reader.fieldnames or []

            required_fields = ['email', 'imap_server', 'smtp_server']
            missing_fields = [field for field in required_fields if field not in headers]
            if missing_fields:
                errors.append(f"Missing required columns: {', '.join(missing_fields)}")

            rows = list(reader)
            if not rows:
                errors.append('CSV contains no data rows')
        except csv.Error as exc:
            errors.append(f'CSV parse error: {exc}')
        except Exception as exc:
            errors.append(f'Validation error: {exc}')

        return len(errors) == 0, errors

    @classmethod
    def import_from_csv(cls, content: str, user_id: int) -> ImportResult:
        del user_id

        errors: List[Dict[str, Any]] = []
        imported_data: List[Dict[str, Any]] = []
        total = 0

        try:
            reader = csv.DictReader(io.StringIO(content))
            rows = list(reader)
            total = len(rows)

            for idx, row in enumerate(rows, start=1):
                try:
                    mailbox_data = cls._convert_csv_row_to_mailbox(row)
                    imported_data.append(mailbox_data)
                except Exception as exc:
                    errors.append(
                        {
                            'row': idx,
                            'email': row.get('email', 'unknown'),
                            'error': str(exc),
                        }
                    )
        except Exception as exc:
            errors.append({'row': 0, 'email': 'unknown', 'error': f'CSV parse failed: {exc}'})

        imported = len(imported_data)
        failed = len(errors)
        return ImportResult(
            success=failed == 0,
            total=total,
            imported=imported,
            failed=failed,
            errors=errors,
            data=imported_data,
        )

    @classmethod
    def import_from_json(cls, content: str, user_id: int) -> ImportResult:
        del user_id

        errors: List[Dict[str, Any]] = []
        imported_data: List[Dict[str, Any]] = []

        try:
            payload = json.loads(content)
            if isinstance(payload, list):
                mailboxes = payload
            elif isinstance(payload, dict) and isinstance(payload.get('mailboxes'), list):
                mailboxes = payload['mailboxes']
            else:
                raise ValueError('Invalid JSON format: expected an array or {"mailboxes": [...]}')

            total = len(mailboxes)

            for idx, mailbox in enumerate(mailboxes, start=1):
                try:
                    if 'email' not in mailbox:
                        raise ValueError('Missing required field: email')
                    imported_data.append(mailbox)
                except Exception as exc:
                    errors.append(
                        {
                            'row': idx,
                            'email': mailbox.get('email', 'unknown') if isinstance(mailbox, dict) else 'unknown',
                            'error': str(exc),
                        }
                    )

            imported = len(imported_data)
            failed = len(errors)
            return ImportResult(
                success=failed == 0,
                total=total,
                imported=imported,
                failed=failed,
                errors=errors,
                data=imported_data,
            )
        except json.JSONDecodeError as exc:
            return ImportResult(
                success=False,
                total=0,
                imported=0,
                failed=1,
                errors=[{'row': 0, 'email': 'unknown', 'error': f'JSON parse error: {exc}'}],
                data=[],
            )
        except Exception as exc:
            return ImportResult(
                success=False,
                total=0,
                imported=0,
                failed=1,
                errors=[{'row': 0, 'email': 'unknown', 'error': str(exc)}],
                data=[],
            )

    @classmethod
    def _convert_csv_row_to_mailbox(cls, row: Dict[str, str]) -> Dict[str, Any]:
        to_bool = lambda value, default: (value if value is not None else default).strip().lower() in {'true', '1', 'yes', 'on'}

        data: Dict[str, Any] = {
            'email': (row.get('email') or '').strip(),
            'name': (row.get('name') or '').strip() or ((row.get('email') or '').split('@')[0]),
            'imap_server': (row.get('imap_server') or '').strip(),
            'imap_port': int((row.get('imap_port') or '993').strip() or 993),
            'imap_username': (row.get('imap_username') or '').strip() or (row.get('email') or '').strip(),
            'imap_password': row.get('imap_password') or '',
            'imap_use_ssl': to_bool(row.get('imap_use_ssl'), 'true'),
            'smtp_server': (row.get('smtp_server') or '').strip(),
            'smtp_port': int((row.get('smtp_port') or '587').strip() or 587),
            'smtp_username': (row.get('smtp_username') or '').strip() or (row.get('email') or '').strip(),
            'smtp_password': row.get('smtp_password') or '',
            'smtp_use_ssl': to_bool(row.get('smtp_use_ssl'), 'false'),
            'smtp_use_tls': to_bool(row.get('smtp_use_tls'), 'true'),
            'use_oauth': to_bool(row.get('use_oauth'), 'false'),
            'oauth_provider': (row.get('oauth_provider') or '').strip() or None,
            'fetch_interval': int((row.get('fetch_interval') or '300').strip() or 300),
        }

        if not data['email']:
            raise ValueError('Email cannot be empty')

        if not data['use_oauth']:
            if not data['imap_server']:
                raise ValueError('IMAP server is required for non-OAuth mailbox')
            if not data['smtp_server']:
                raise ValueError('SMTP server is required for non-OAuth mailbox')

        return data

    @classmethod
    def generate_csv_template(cls) -> str:
        headers = ','.join(cls.CSV_COLUMNS)
        example_rows = [
            'example@gmail.com,My Gmail,imap.gmail.com,993,user@gmail.com,password,true,smtp.gmail.com,587,user@gmail.com,password,false,true,false,,300',
            'example@outlook.com,My Outlook,outlook.office365.com,993,user@outlook.com,password,true,smtp.office365.com,587,user@outlook.com,password,false,true,true,microsoft,300',
        ]
        return headers + '\n' + '\n'.join(example_rows)

    @classmethod
    def generate_json_template(cls) -> str:
        template = {
            'mailboxes': [
                {
                    'email': 'example@gmail.com',
                    'name': 'My Gmail',
                    'imap_server': 'imap.gmail.com',
                    'imap_port': 993,
                    'imap_username': 'user@gmail.com',
                    'imap_password': 'password',
                    'imap_use_ssl': True,
                    'smtp_server': 'smtp.gmail.com',
                    'smtp_port': 587,
                    'smtp_username': 'user@gmail.com',
                    'smtp_password': 'password',
                    'smtp_use_tls': True,
                    'fetch_interval': 300,
                }
            ]
        }
        return json.dumps(template, indent=2, ensure_ascii=False)
