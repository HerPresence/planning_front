import { useAuth } from "../contexts/AuthContext";

export function usePagePermission(menuKey) {
  const { canView, canEdit, canCreate } = useAuth();
  return {
    canView: canView(menuKey),
    canEdit: canEdit(menuKey),
    canCreate: canCreate(menuKey),
  };
}
