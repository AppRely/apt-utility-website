/* ===================== Audit Modal ===================== */
export type AuditModalProps = {
  open: boolean;
  onClose: () => void;
  projectId: number;
};

/* ===================== Normalized Objects ===================== */
export type NormalizedObject = {
  id?: number;
  start_frame?: number;
  end_frame?: number;
};