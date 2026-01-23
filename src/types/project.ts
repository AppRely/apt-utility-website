export interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onProjectPending?: (project: any) => void;     
  onProjectCreated?: (project: any) => void;     
  onProjectFailed?: (id: number) => void;       
}
