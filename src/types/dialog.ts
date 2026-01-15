import React from "react";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmText: string;
  confirmClassName?: string;
  loading?: boolean;
  loadingText?: string;
  onConfirm: () => void;
};
