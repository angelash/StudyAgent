import { Suspense } from 'react';
import { StudentKnowledgeClient } from './student-knowledge-client';

export default function StudentKnowledgePage() {
  return (
    <Suspense fallback={<main style={{ padding: 40 }}>正在加载知识体系页...</main>}>
      <StudentKnowledgeClient />
    </Suspense>
  );
}
