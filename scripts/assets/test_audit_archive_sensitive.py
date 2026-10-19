import gzip
import json
import unittest
from audit_archive_sensitive import decode, inspect


class StructuredAuditTest(unittest.TestCase):
    def test_detects_nested_credentials_identity_and_url_parameters_without_returning_values(self):
        payload = {'headers': {'Authorization': 'Bearer fictional-secret-token'}, 'profile': {'user_id': 42, 'nickname': 'fictional-child'},
                   'url': 'https://fictional.example/resource?access_token=fictional-secret'}
        counts = inspect(decode(gzip.compress(json.dumps(payload).encode())))
        self.assertEqual(counts['credential:authorization'], 1)
        self.assertEqual(counts['credential:bearer_header'], 1)
        self.assertEqual(counts['identity_candidate:userid'], 1)
        self.assertEqual(counts['identity_candidate:nickname'], 1)
        self.assertEqual(counts['url_parameter:accesstoken'], 1)
        self.assertNotIn('fictional-secret', json.dumps(counts))
        self.assertNotIn('fictional-child', json.dumps(counts))

    def test_keeps_educational_fields_separate_and_refuses_unbounded_nesting(self):
        self.assertFalse(inspect({'title': '题目中的邮箱示例不是用户元数据', 'answer': '8', 'token': '', 'options': [1, 2, 3]}))
        value = None
        for _ in range(160):
            value = {'child': value}
        with self.assertRaisesRegex(ValueError, 'structure_exceeds_audit_bound'):
            inspect(value)


if __name__ == '__main__':
    unittest.main()
