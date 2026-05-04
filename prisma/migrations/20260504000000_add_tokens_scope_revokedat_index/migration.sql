-- CreateIndex
-- revokeAllByUserAndScope (WHERE user_id=? AND scope=? AND revoked_at IS NULL) の高速化
CREATE INDEX "tokens_user_id_scope_revoked_at_idx" ON "tokens"("user_id", "scope", "revoked_at");
