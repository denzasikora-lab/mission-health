-- Исходные оценки, тексты и события сохраняются. Новое представление требует повторной индексации.
DELETE FROM journal_text_vectors
WHERE EXISTS (
  SELECT 1 FROM journal_messages AS m
  WHERE m.id=journal_text_vectors.message_id
    AND m.owner_id=journal_text_vectors.owner_id
    AND m.astronaut_id=journal_text_vectors.astronaut_id
    AND m.role!='assistant'
    AND CASE WHEN json_valid(m.wellbeing_json) THEN
      json_type(m.wellbeing_json,'$.score')='integer'
      AND json_extract(m.wellbeing_json,'$.score') BETWEEN 1 AND 10
      AND (json_type(m.wellbeing_json,'$.wellbeingScale') IS NULL OR json_extract(m.wellbeing_json,'$.wellbeingScale')=10)
    ELSE 0 END
);
--> statement-breakpoint
UPDATE journal_messages SET vector_status='pending'
WHERE role!='assistant'
  AND CASE WHEN json_valid(wellbeing_json) THEN
    json_type(wellbeing_json,'$.score')='integer'
    AND json_extract(wellbeing_json,'$.score') BETWEEN 1 AND 10
    AND (json_type(wellbeing_json,'$.wellbeingScale') IS NULL OR json_extract(wellbeing_json,'$.wellbeingScale')=10)
  ELSE 0 END;
