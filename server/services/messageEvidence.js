/**
 * Edit / delete helpers that preserve the original text for moderation: a sender
 * must not be able to erase evidence by editing or deleting before a report.
 */

/** Records the pre-edit text and applies the edit. No-op when the text is unchanged. */
async function applyMessageEdit(prisma, message, newText) {
  const text = String(newText);
  if (message.text === text) return false;
  await prisma.$transaction([
    prisma.messageEdit.create({ data: { messageId: message.id, previousText: message.text } }),
    prisma.message.update({ where: { id: message.id }, data: { text, isEdited: true } }),
  ]);
  return true;
}

/** Soft delete: clients see an empty message; the original is kept server-side. */
async function applyMessageDelete(prisma, message) {
  await prisma.message.update({
    where: { id: message.id },
    data: {
      isDeleted: true,
      text: '',
      deletedText: message.isDeleted ? message.deletedText : message.text,
      deletedAt: message.deletedAt || new Date(),
    },
  });
}

module.exports = { applyMessageEdit, applyMessageDelete };
