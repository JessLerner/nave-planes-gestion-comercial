import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, X } from 'lucide-react';
import { useAuth } from './AuthProvider';

export const AccountSettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user, updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) return setMessage('Usá al menos 8 caracteres.');
    if (password !== confirmation) return setMessage('Las contraseñas no coinciden.');
    setSaving(true); const result = await updatePassword(password); setSaving(false);
    if (result.error) return setMessage(result.error);
    onClose();
  };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"><section className="w-full max-w-md bg-white shadow-2xl"><header className="flex items-center justify-between border-b-[3px] border-[#a41f27] px-6 py-5"><div><h2 className="font-bold text-[#18191b]">Mi cuenta</h2><p className="mt-0.5 text-xs text-[#57575c]">{user?.email}</p></div><button onClick={onClose} aria-label="Cerrar" className="text-[#57575c] hover:text-[#a41f27]"><X className="h-5 w-5" /></button></header><form onSubmit={submit} className="space-y-4 px-6 py-6"><p className="text-sm text-[#57575c]">Cambiá tu contraseña personal. La información operativa y los permisos no se modifican desde esta pantalla.</p>{message && <div className="border border-[#a41f27]/30 bg-[#a41f27]/5 px-3 py-2 text-xs text-[#6f151a]">{message}</div>}<SecretInput label="Nueva contraseña" value={password} setValue={setPassword} show={show} toggle={() => setShow(!show)} /><SecretInput label="Repetir contraseña" value={confirmation} setValue={setConfirmation} show={show} toggle={() => setShow(!show)} /><button disabled={saving} className="flex w-full items-center justify-center gap-2 bg-[#a41f27] px-4 py-3 text-sm font-bold text-white hover:bg-[#18191b] disabled:opacity-50"><KeyRound className="h-4 w-4" />{saving ? 'Guardando…' : 'Actualizar contraseña'}</button></form></section></div>;
};

const SecretInput: React.FC<{ label: string; value: string; setValue: (value: string) => void; show: boolean; toggle: () => void }> = ({ label, value, setValue, show, toggle }) => <label className="block text-xs font-bold text-[#18191b]">{label}<span className="relative mt-1.5 block"><input required type={show ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={event => setValue(event.target.value)} className="w-full border border-[#d8d8d9] px-3 py-2.5 pr-10 text-sm outline-none focus:border-[#a41f27]" /><button type="button" onClick={toggle} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-0 top-0 h-full px-3 text-[#57575c]">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>;
