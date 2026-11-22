export function canEditIncorporation(isSupervisor: boolean, selected?: { status: string }) {
  return isSupervisor && (!selected || selected.status === 'borrador' || selected.status === 'observado');
}
