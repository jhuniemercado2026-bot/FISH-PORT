const matchesUserId = (
  value: unknown,
  currentUserId: number | string | null | undefined
) => {
  if (currentUserId === null || currentUserId === undefined || String(currentUserId).trim() === "") {
    return false;
  }

  return value !== null && value !== undefined && String(value) === String(currentUserId);
};

export const isRecordOwnedByUser = (
  record: Record<string, any> | null | undefined,
  currentUserId?: number | string | null
) => {
  if (!record) return false;

  const creatorCandidates = [
    record.created_by,
    record.created_by?.user_id,
    record.created_by?.id,
    record.created_by_id,
    record.createdBy,
    record.createdBy?.user_id,
    record.createdBy?.id,
    record.submitted_by,
    record.submittedBy,
    record.submittedBy?.user_id,
    record.submittedBy?.id,
  ];

  return creatorCandidates.some((value) => matchesUserId(value, currentUserId));
};
