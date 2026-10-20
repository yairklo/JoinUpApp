/**
 * Edit / delete helpers that preserve the original text for moderation: a sender
 * must not be able to erase evidence by editing or deleting before a report.
 *
 * Both re-read the row inside a transaction and write conditionally, so a
 * concurrent edit/delete cannot overwrite a deleted message or lose a version.
 */

const MAX_ATTEMPTS = 3;

/**
 * Records the pre-edit text and applies the edit.
 * @returns {Promise<'edited'|'unchanged'|'conflict'>} 'conflict' = the message was
 *   deleted or changed concurrently, nothing was written.
 */
async function applyMessageEdit(prisma, message, newText) {
  const text = String(newText);
  return prisma.$transaction(async (tx) => {
    const fresh = await tx.message.findUnique({ where: { id: message.id } });
    if (!fresh || fresh.isDeleted) return 'conflict';
    if (fresh.text === text) return 'unchanged';
    // Condition on the text we just read so a concurrent edit makes this a no-op.
    const res = await tx.message.updateMany({
      where: { id: fresh.id, isDeleted: false, text: fresh.text },
      data: { text, isEdited: true },
    });
    if (res.count !== 1) return 'conflict';
    await tx.messageEdit.create({ data: { messageId: fresh.id, previousText: fresh.text } });
    return 'edited';
  });
}

/**
 * Soft delete: clients see an empty message; the original is kept server-side.
 * @returns {Promise<boolean>} true when the message is now deleted (or already was)
 */
async function applyMessageDelete(prisma, message) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const done = await prisma.$transaction(async (tx) => {
      const fresh = await tx.message.findUnique({ where: { id: message.id } });
      if (!fresh || fresh.isDeleted) return true;
      const res = await tx.message.updateMany({
        where: { id: fresh.id, isDeleted: false, text: fresh.text },
        data: { isDeleted: true, text: '', deletedText: fresh.text, deletedAt: new Date() },
      });
      return res.count === 1;
    });
    if (done) return true;
  }
  return false;
}

module.exports = { applyMessageEdit, applyMessageDelete };
