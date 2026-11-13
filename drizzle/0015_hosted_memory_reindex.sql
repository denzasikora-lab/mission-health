UPDATE journal_messages
SET vector_status = 'pending'
WHERE role != 'assistant';
