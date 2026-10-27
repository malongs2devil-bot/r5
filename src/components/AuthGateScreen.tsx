import React, { useEffect, useState } from 'react';
import { Shield, Sword, LogOut, Server, UserCheck, Maximize2, Minimize2 } from 'lucide-react';
import { LOGIN_BACKDROP_URL } from '../data/gameData';
import { AccountDoc } from '../types/game';
import { User } from '../firebase';

interface ServerEntry {
  id: string;
  name: string;
  status: string;
  load: number;
}

interface AuthGateScreenProps {
  firebaseUser: User | null;
  existingAccount: AccountDoc | null;
  loading: boolean;
  errorMsg: string | null;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onGoogleSignIn: () => Promise<void>;
  onServerDirectLogin: (gameUsername: string, serverId: string) => Promise<void>;
  onSubmitGameAccount: (gameUsername: string, serverId: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const AuthGateScreen: React.FC<AuthGateScreenProps> = ({
  firebaseUser,
  existingAccount,
  loading,
  errorMsg,
  isFullscreen = false,
  onToggleFullscreen,
  onGoogleSignIn,
  onServerDirectLogin,
  onSubmitGameAccount,
  onSignOut,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [gameUsername, setGameUsername] = useState(() => {
    try {
      return localStorage.getItem('ttkn_direct_username') || 'ChienBinh01';
    } catch {
      return 'ChienBinh01';
    }
  });
  const [selectedServer, setSelectedServer] = useState('s1');
  const [servers, setServers] = useState<ServerEntry[]>([
    { id: 's1', name: 'S1 - Thành Trì Hư Không', status: 'Mới Mở', load: 35 },
    { id: 's2', name: 'S2 - Pháo Đài Băng Giá', status: 'Ổn Định', load: 24 },
    { id: 's3', name: 'S3 - Kỷ Nguyên Tiến Hoá', status: 'Đông Đúc', load: 52 },
  ]);

  useEffect(() => {
    if (existingAccount) {
      setGameUsername(existingAccount.gameUsername);
      setSelectedServer(existingAccount.serverId || 's1');
      setMode('login');
    } else if (firebaseUser?.displayName) {
      const clean = firebaseUser.displayName.replace(/[^a-zA-Z0-9_-]/g, '');
      setGameUsername(clean.length >= 3 ? clean.slice(0, 18) : 'ChienBinh01');
      setMode('register');
    }
  }, [existingAccount, firebaseUser]);

  useEffect(() => {
    fetch('/api/server-stats')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.servers)) setServers(d.servers);
      })
      .catch(() => {});
  }, []);

  const handleEnter = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmitGameAccount(gameUsername, selectedServer);
  };

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (gameUsername.trim().length < 3) return;
    await onServerDirectLogin(gameUsername.trim(), selectedServer);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#090b10] flex flex-col justify-between">
      {/* Cinematic Post-Apocalyptic Backdrop with Resilient Fallback */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1f140e] via-[#0d1017] to-[#090b10]">
        {!imgFailed && (
          <img
            src={LOGIN_BACKDROP_URL}
            alt="Bối cảnh thành phố hậu tận thế"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover opacity-55"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090b10] via-[#090b10]/55 to-[#090b10]/75" />
      </div>

      {/* Top Bar Contract (3 Clean Zones) */}
      <header className="relative z-10 flex items-center justify-between gap-8 px-6 py-2.5 border-b border-white/10 bg-[#090b10]/88 shrink-0">
        <span className="font-display text-lg font-bold tracking-wide text-amber-400 whitespace-nowrap shrink-0">
          Tận Thế Kỷ Nguyên 3D
        </span>

        <nav className="flex items-center gap-5 text-xs font-medium text-zinc-300">
          <span className="whitespace-nowrap shrink-0">3 Hệ Phái</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap shrink-0">18 Kỹ Năng 3D</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap shrink-0">32 Bản Đồ</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap shrink-0">Xưởng Tài Nguyên .GLB</span>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-300 bg-zinc-900 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
              <span>{isFullscreen ? 'Thu Nhỏ' : 'Toàn Màn Hình'}</span>
            </button>
          )}
          {firebaseUser ? (
            <button
              type="button"
              onClick={onSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              Đổi Tài Khoản
            </button>
          ) : (
            <button
              type="button"
              onClick={onGoogleSignIn}
              disabled={loading}
              className="px-3.5 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              Đăng Nhập Nhanh
            </button>
          )}
        </div>
      </header>

      {/* Main Landscape Split Gate — Zero Scrollbars */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-3 overflow-hidden">
        <div className="w-full max-w-5xl grid grid-cols-12 items-center gap-7">
          {/* Left Hero Lore & Server Selection */}
          <div className="col-span-7 space-y-3.5">
            <div className="text-xs font-medium text-amber-400 tracking-wide">
              MMORPG 3D Hậu Tận Thế · Màn Hình Ngang Trực Tuyến
            </div>
            <h1
              className="font-display text-3xl font-bold text-white leading-tight"
              style={{ textWrap: 'balance' }}
            >
              Thức Tỉnh Dị Năng Giữa Đống Tro Tàn Nhân Loại
            </h1>
            <p className="text-xs text-zinc-300 max-w-xl leading-relaxed">
              Hoá thân thành Dị Năng Giả, Chiến Binh Thiết Giáp hoặc Người Tiến Hoá. Săn Boss rớt đồ Hoàng Kim, cường hoá trang bị phát sáng +15, cưỡi Sói Cơ Giới Fenrir chinh phục 32 vùng đất chết.
            </p>

            {/* Server List */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <Server className="w-3.5 h-3.5 text-amber-400" />
                <span>Chọn Cụm Máy Chủ Chiến Đấu</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {servers.map((srv) => {
                  const active = selectedServer === srv.id;
                  return (
                    <button
                      key={srv.id}
                      type="button"
                      onClick={() => setSelectedServer(srv.id)}
                      className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                        active
                          ? 'bg-amber-500/15 border-amber-400 text-white'
                          : 'bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      <div className="text-xs font-semibold truncate">{srv.name}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5 font-mono-num truncate">
                        {srv.status} · {srv.load}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Account Login / Register Box */}
          <div className="col-span-5 bg-[#10131c]/95 border border-zinc-800 rounded-xl p-4 space-y-3">
            {!firebaseUser ? (
              <div className="space-y-3">
                <div className="space-y-0.5">
                  <h2 className="font-display text-base font-bold text-white">
                    Cổng Tài Khoản Chiến Binh
                  </h2>
                  <p className="text-[11px] text-zinc-400 leading-snug">
                    Đăng nhập đám mây Google hoặc kết nối trực tiếp bằng ID Máy Chủ Hoàng Thành.
                  </p>
                </div>

                {errorMsg && (
                  <div className="p-2 rounded-lg bg-amber-950/80 border border-amber-500/50 text-[11px] text-amber-200 leading-snug">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  disabled={loading}
                  className="w-full py-2 px-3.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 disabled:opacity-50 text-zinc-100 font-semibold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span>{loading ? 'Đang kết nối...' : 'Đăng Nhập Đám Mây Google'}</span>
                </button>

                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <div className="h-px flex-1 bg-zinc-800" />
                  <span>HOẶC ĐĂNG NHẬP TRỰC TIẾP MÁY CHỦ</span>
                  <div className="h-px flex-1 bg-zinc-800" />
                </div>

                <form onSubmit={handleDirectSubmit} className="space-y-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-zinc-300">
                      ID Tài Khoản Máy Chủ (3–24 ký tự không dấu)
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={24}
                      value={gameUsername}
                      onChange={(e) =>
                        setGameUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))
                      }
                      placeholder="VD: ChienBinh01"
                      className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-white focus:outline-none focus:border-amber-400 font-mono-num"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || gameUsername.length < 3}
                    className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <Sword className="w-4 h-4" />
                    <span>
                      {loading ? 'Đang kết nối Máy Chủ...' : 'Vào Trực Tiếp Máy Chủ'}
                    </span>
                  </button>
                </form>
              </div>
            ) : (
              <form onSubmit={handleEnter} className="space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-bold text-white truncate">
                      {existingAccount ? 'Đăng Nhập Tài Khoản Game' : 'Đăng Ký Định Danh Chiến Binh'}
                    </h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                      Đã xác thực: {firebaseUser.email}
                    </p>
                  </div>
                  <UserCheck className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />
                </div>

                {/* Segmented Mode Tabs */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      mode === 'login'
                        ? 'bg-amber-500 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Đăng Nhập Game
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      mode === 'register'
                        ? 'bg-amber-500 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Cập Nhật ID
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-zinc-300">
                    Tên Tài Khoản Chiến Binh (3–24 ký tự không dấu)
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={24}
                    value={gameUsername}
                    onChange={(e) => setGameUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    placeholder="VD: ChienBinhTanThe"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-white focus:outline-none focus:border-amber-400 font-mono-num"
                  />
                </div>

                <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                  <span>Máy chủ:</span>
                  <span className="text-amber-400 font-medium truncate ml-2">
                    {servers.find((s) => s.id === selectedServer)?.name}
                  </span>
                </div>

                {errorMsg && (
                  <div className="p-2 rounded-lg bg-rose-950/80 border border-rose-500/50 text-xs text-rose-200">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || gameUsername.length < 3}
                  className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Sword className="w-4 h-4" />
                  <span>{loading ? 'Đang tải danh sách nhân vật...' : 'Vào Sảnh Chọn Nhân Vật'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Quiet Footer */}
      <footer className="relative z-10 px-6 py-2 border-t border-white/10 bg-[#090b10]/90 flex items-center justify-between text-[11px] text-zinc-500 shrink-0">
        <span>Tận Thế Kỷ Nguyên 3D · Tự động co giãn đồng bộ trên mọi dòng điện thoại</span>
        <span>Hỗ trợ thay thế mô hình 3D .GLB / .GLTF trực tiếp trong game</span>
      </footer>
    </div>
  );
};
