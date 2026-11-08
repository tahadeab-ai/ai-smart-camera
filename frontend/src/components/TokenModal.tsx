import React, { useEffect, useState } from 'react';
import { Key, X, Lock, Check, ShieldCheck, ShieldAlert } from 'lucide-react';
import { ApiClient } from '../api/client';

interface TokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const TokenModal: React.FC<TokenModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [tokenInput, setTokenInput] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setTokenInput(ApiClient.getToken() || '');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasConfiguredToken = ApiClient.hasToken();

  const handleSave = () => {
    const trimmed = tokenInput.trim();
    ApiClient.setToken(trimmed.length > 0 ? trimmed : null);
    onSaved();
    onClose();
  };

  const handleClear = () => {
    ApiClient.clearToken();
    setTokenInput('');
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2 text-white font-semibold">
            <Lock className="w-5 h-5 text-sky-400" />
            <span>Colab Access Token</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          {hasConfiguredToken ? (
            <div className="flex items-center space-x-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
              <ShieldCheck className="w-4 h-4" />
              <span>Token Configured (Stored in-memory)</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 text-slate-400 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>No Token Active (Public Mode)</span>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          If your remote Google Colab deployment has configured an access token, enter it below to authenticate REST API calls and WebSocket camera streaming. The token is maintained strictly in browser memory.
        </p>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300">Security Token</label>
          <div className="relative">
            <input
              type="password"
              placeholder="Leave empty if authentication is disabled"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-sky-500 font-mono"
            />
            <Key className="w-4 h-4 text-slate-500 absolute right-3 top-3.5 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center justify-end space-x-2 pt-2">
          <button
            onClick={handleClear}
            className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            Clear Token
          </button>
          <button
            onClick={handleSave}
            className="flex items-center space-x-1.5 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-sky-600/30 transition"
          >
            <Check className="w-4 h-4" />
            <span>Save & Apply</span>
          </button>
        </div>
      </div>
    </div>
  );
};
