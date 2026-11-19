CREATE INDEX "DataPoint_workspaceId_date_id_idx"
ON "DataPoint" ("workspaceId", "date" DESC, "id" DESC);
