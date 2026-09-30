import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Users, 
  Key, 
  Lock, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  FileCode, 
  UserCheck, 
  AlertCircle,
  Copy,
  Check
} from 'lucide-react';
import { UserProfile } from '../types';
import { RBAC_USERS } from '../data/mockData';

interface UsersRBACModuleProps {
  currentUser: UserProfile;
  onSwitchUser: (user: UserProfile) => void;
}

export const UsersRBACModule: React.FC<UsersRBACModuleProps> = ({
  currentUser,
  onSwitchUser
}) => {
  const [users, setUsers] = useState<UserProfile[]>(RBAC_USERS);
  const [copiedToken, setCopiedToken] = useState(false);

  const permissionsList = [
    { key: 'VIEW_3D_TWIN', label: 'Visualizar Gemelo 3D & Telemetría' },
    { key: 'RUN_ML_SIMULATION', label: 'Ejecutar Modelos de IA & What-If' },
    { key: 'CONTROL_IOT_ACTUATORS', label: 'Control Remoto de Actuadores IoT' },
    { key: 'TRIGGER_EMERGENCY_ALERTS', label: 'Emitir Alertas Sanitarias (OMS)' },
    { key: 'EXPORT_SCIENTIFIC_REPORTS', label: 'Generar y Exportar Reportes' },
    { key: 'MANAGE_USERS', label: 'Administrar Usuarios & Roles RBAC' },
    { key: 'CONFIGURE_SPECTRAL_BANDS', label: 'Configurar Capas Satelitales' }
  ];

  // Generate simulated JWT Token based on current user
  const simulatedHeader = {
    alg: 'RS256',
    typ: 'JWT',
    kid: 'aquatwin-auth-2026'
  };

  const simulatedPayload = {
    sub: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
    role: currentUser.role,
    org: currentUser.organization,
    permissions: currentUser.permissions,
    iss: 'https://auth.aquatwin.gov.ar/oauth2/token',
    aud: 'https://api.aquatwin.gov.ar/v2',
    iat: Math.floor(Date.now() / 1000) - 300,
    exp: Math.floor(Date.now() / 1000) + 3600 * 8
  };

  const rawJwtToken = `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImFxdWF0d2luLWF1dGgtMjAyNiJ9.${btoa(
    JSON.stringify(simulatedPayload)
  ).replace(/=/g, '')}.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c`;

  const copyTokenToClipboard = () => {
    navigator.clipboard.writeText(rawJwtToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: RBAC & Security */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-xl p-4 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-cyan-600/30 border border-cyan-400/50 flex items-center justify-center text-cyan-300">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-100">
                Control de Acceso Basado en Roles (RBAC) & Autenticación OAuth2/JWT
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-900 text-cyan-200 border border-cyan-700 font-mono">
                OAuth2 / OpenID Connect
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Gestión de privilegios granulares para científicos, operadores hidráulicos, autoridades sanitarias y administradores.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 self-start md:self-auto">
          <span>Usuario en sesión:</span>
          <span className="font-bold text-cyan-400 font-mono">{currentUser.name}</span>
        </div>
      </div>

      {/* User Directory & Switch Profile */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-slate-100 text-sm">
              Directorio de Usuarios & Perfiles Activos
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Haz clic en un perfil para simular su sesión y permisos:
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {users.map((u) => {
            const isCurrent = u.id === currentUser.id;
            return (
              <div
                key={u.id}
                onClick={() => onSwitchUser(u)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  isCurrent
                    ? 'bg-cyan-950/80 border-cyan-500 shadow-md shadow-cyan-950/50'
                    : 'bg-slate-950/70 border-slate-800/90 hover:border-slate-700 hover:bg-slate-900/80'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-700 shrink-0">
                    <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-100 leading-snug">{u.name}</h4>
                    <span className="text-[10px] font-mono font-semibold text-cyan-400">{u.role}</span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 space-y-1 pt-2 border-t border-slate-800/80">
                  <p className="truncate">{u.organization}</p>
                  <p className="text-slate-500">{u.email}</p>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  <span className={`px-1.5 py-0.2 rounded font-mono ${u.mfaEnabled ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                    {u.mfaEnabled ? 'MFA Activo' : 'Sin MFA'}
                  </span>
                  {isCurrent ? (
                    <span className="text-cyan-400 font-bold">Activo</span>
                  ) : (
                    <span className="text-slate-500 hover:text-cyan-300">Cambiar</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Permissions Matrix & JWT Token Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Granular Permissions Matrix */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-slate-100 text-sm">
                Matriz de Permisos Granulares (Rol: {currentUser.role})
              </h3>
            </div>
          </div>

          <div className="divide-y divide-slate-800/80">
            {permissionsList.map((perm) => {
              const hasPerm = currentUser.permissions.includes(perm.key) || currentUser.permissions.includes('ALL_PERMISSIONS');
              return (
                <div key={perm.key} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-medium text-slate-200">{perm.label}</span>
                    <p className="text-[10px] font-mono text-slate-500">{perm.key}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {hasPerm ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-700/80 text-emerald-300 font-mono text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Concedido
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-500 font-mono text-[11px] flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5 text-slate-600" />
                        Denegado
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Simulated JWT Token Inspector */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-purple-400" />
              <h3 className="font-bold text-slate-100 text-sm">
                Token JWT (OAuth2 Bearer Inspection)
              </h3>
            </div>
            <button
              onClick={copyTokenToClipboard}
              className="text-xs text-purple-300 hover:text-white flex items-center gap-1 font-mono"
            >
              {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedToken ? 'Copiado' : 'Copiar Token'}</span>
            </button>
          </div>

          <p className="text-xs text-slate-400">
            Estructura criptográfica del token portador decodificado en tiempo de ejecución:
          </p>

          <div className="space-y-2 font-mono text-[11px]">
            {/* Header */}
            <div className="bg-slate-950/90 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-rose-400 uppercase font-bold block mb-1">HEADER: Algoritmo & Tipo</span>
              <pre className="text-rose-300 overflow-x-auto">{JSON.stringify(simulatedHeader, null, 2)}</pre>
            </div>

            {/* Payload Claims */}
            <div className="bg-slate-950/90 border border-slate-800 p-2.5 rounded-lg max-h-56 overflow-y-auto">
              <span className="text-[10px] text-purple-400 uppercase font-bold block mb-1">PAYLOAD: Datos & Permisos (Claims)</span>
              <pre className="text-purple-300 overflow-x-auto">{JSON.stringify(simulatedPayload, null, 2)}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
