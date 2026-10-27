import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthProvider';

export const PasswordSetupScreen: React.FC<{ mode: 'invite' | 'recovery' }> = ({ mode }) => {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) return setMessage('La contraseña debe tener al menos 8 caracteres.');
    if (password !== confirmation) return setMessage('Las contraseñas no coinciden.');
    setSaving(true);
    const result = await updatePassword(password);
    setSaving(false);
    setMessage(result.error || null);
  };

  return <main className="min-h-screen bg-[#18191b] px-5 py-10 flex items-center justify-center">
    <section className="w-full max-w-md overflow-hidden border border-white/10 bg-white shadow-2xl">
      <div className="border-b-[3px] border-[#a41f27] px-8 py-7"><img src="/brand/nave-plan-logo.png" alt="Nave.Plan" className="w-64 max-w-full h-auto" /></div>
      <div className="px-8 py-8">
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] uppercase text-[#a41f27]"><ShieldCheck className="h-4 w-4" /> Acceso seguro</div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#18191b]">{mode === 'invite' ? 'Creá tu contraseña' : 'Elegí una nueva contraseña'}</h1>
        <p className="mt-2 text-sm leading-6 text-[#57575c]">{mode === 'invite' ? 'Para completar la activación de tu cuenta, definí una contraseña personal.' : 'Esta contraseña reemplazará la anterior para tu cuenta Nave.Plan.'}</p>
        {message && <div className="mt-5 border border-[#a41f27]/30 bg-[#a41f27]/5 px-3 py-2.5 text-xs text-[#6f151a]">{message}</div>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <PasswordInput label="Nueva contraseña" value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword(value => !value)} />
          <PasswordInput label="Repetir contraseña" value={confirmation} onChange={setConfirmation} visible={showPassword} onToggle={() => setShowPassword(value => !value)} />
          <button disabled={saving} className="flex w-full items-center justify-center gap-2 bg-[#a41f27] px-4 py-3 text-sm font-bold text-white hover:bg-[#18191b] disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Guardar contraseña y continuar</button>
        </form>
        <button type="button" onClick={() => void signOut()} className="mt-5 text-xs font-semibold text-[#57575c] underline underline-offset-4">Cancelar y cerrar sesión</button>
      </div>
      <footer className="bg-[#18191b] px-8 py-5 text-xs text-[#a9a9ae]">NAVE.PLAN · Tu próximo auto, más cerca</footer>
    </section>
  </main>;
};

const PasswordInput: React.FC<{ label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggle: () => void }> = ({ label, value, onChange, visible, onToggle }) => <label className="block text-xs font-bold text-[#18191b]">{label}<span className="relative mt-1.5 block"><LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-[#57575c]" /><input required type={visible ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={event => onChange(event.target.value)} className="w-full border border-[#d8d8d9] py-2.5 pl-10 pr-11 text-sm outline-none focus:border-[#a41f27]" /><button type="button" onClick={onToggle} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-0 top-0 h-full px-3 text-[#57575c] hover:text-[#a41f27]">{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>;
