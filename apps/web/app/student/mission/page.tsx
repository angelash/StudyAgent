import { Suspense } from 'react';
import { StudentMissionClient } from './student-mission-client';

export default function StudentMissionPage() {
  return (
    <Suspense fallback={<main style={{ padding: 40 }}>正在加载学生任务页...</main>}>
      <StudentMissionClient />
    </Suspense>
  );
}

