from pathlib import Path
import re
base=Path('apps/api/src')
current=['infrastructure/assistant-note-storage.integration.test.ts','infrastructure/backup.integration.test.ts','infrastructure/paper-practice-migration.test.ts','infrastructure/teaching-tool-storage.integration.test.ts','infrastructure/topic-whiteboard-postgres.integration.test.ts','infrastructure/topic-whiteboard-storage.integration.test.ts','infrastructure/topic-whiteboard-visual-postgres.integration.test.ts','infrastructure/topic-whiteboard-visual-storage.integration.test.ts','infrastructure/whiteboard-question-postgres.integration.test.ts','infrastructure/whiteboard-question-storage.integration.test.ts','infrastructure/whiteboard-question-visual-storage.integration.test.ts','modules/library/paper-practice-recovery.integration.test.ts','modules/learning/whiteboard-question-visual.integration.test.ts','modules/learning/topic-whiteboard-visual-files.test.ts']
legacy_native=['infrastructure/paper-practice-migration.test.ts','infrastructure/source-course-check-storage.integration.test.ts','infrastructure/topic-whiteboard-storage.integration.test.ts','infrastructure/topic-whiteboard-visual-storage.integration.test.ts','infrastructure/whiteboard-question-storage.integration.test.ts']
changes={}
for name in set(current+legacy_native):
 p=base/name;s=p.read_text(encoding='utf-8');before=s
 if name in current:
  s=s.replace('.toBe(22)','.toBe(23)').replace('{ version: 22 }','{ version: 23 }')
  s=s.replace('native current schema22','native current schema23').replace('opens current schema20','opens current schema23').replace('cold restores current schema20','cold restores current schema23').replace('backs up schema19 and cold restores','backs up current schema23 and cold restores')
 if name in legacy_native:
  s,n=re.subn(r'''((\w+)\.exec\((['"])[^\n]*?DELETE FROM schema_migrations[^\n]*?\3\);)''',lambda m:m[1]+' '+m[2]+'.exec("DROP INDEX IF EXISTS assistant_note_creation_request;UPDATE study_restore_guard SET state=\'ready\' WHERE id=1;");',s)
  assert n>0,name
 if name=='infrastructure/assistant-note-storage.integration.test.ts':
  assert "await sql('DELETE FROM schema_migrations WHERE version=22');" in s
  s=s.replace("await sql('DELETE FROM schema_migrations WHERE version=22');","await sql('DELETE FROM schema_migrations WHERE version>=22'); await sql(\"UPDATE study_restore_guard SET state='ready' WHERE id=1\");")
 if name in ['infrastructure/teaching-tool-storage.integration.test.ts','infrastructure/whiteboard-question-visual-storage.integration.test.ts']:
  s,n=re.subn(r"(await sql\('DELETE FROM schema_migrations WHERE version>=\d+'\);)",lambda m:m[1]+" await sql('DROP INDEX IF EXISTS assistant_note_creation_request'); await sql(\"UPDATE study_restore_guard SET state='ready' WHERE id=1\");",s);assert n==1,name
 if name=='infrastructure/whiteboard-question-postgres.integration.test.ts':
  marker="await raw.query('DELETE FROM schema_migrations WHERE version>=19');";assert marker in s
  s=s.replace(marker,marker+" await raw.query('DROP INDEX IF EXISTS assistant_note_creation_request'); await raw.query(\"UPDATE study_restore_guard SET state='ready' WHERE id=1\");")
 if name=='infrastructure/backup.integration.test.ts':
  s=s.replace("get()?.state).toBe('ready');","get()?.state).toBe('ready-schema23');").replace("unblock.exec(\"UPDATE study_restore_guard SET state='ready'\")","unblock.exec(\"UPDATE study_restore_guard SET state='ready-schema23'\")")
  s=s.replace('rejects future schema23','rejects future schema24').replace('VALUES(23,?)','VALUES(24,?)')
 if name=='modules/library/paper-practice-recovery.integration.test.ts':
  s=s.replace('VALUES(23,?)','VALUES(24,?)').replace('VALUES(23)','VALUES(24)')
 assert s!=before,name
 p.write_text(s,encoding='utf-8',newline='\n');changes[name]={'oldLines':len(before.splitlines()),'newLines':len(s.splitlines())}
print(changes)
