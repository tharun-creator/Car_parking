'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { registerCredentialsUser } from '@/app/actions';
import { AlertCircle } from 'lucide-react';

interface FormErrors {
  email?: string[];
  password?: string[];
  name?: string[];
  phone_number?: string[];
  role?: string[];
  role_other_detail?: string[];
}

export function AuthPortal() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Sign In inputs
  const [signInData, setSignInData] = useState({
    email: '',
    password: '',
  });

  // Sign Up inputs
  const [signUpData, setSignUpData] = useState({
    email: '',
    password: '',
    name: '',
    phone_number: '',
    role: '',
    role_other_detail: '',
  });

  const handleSignInChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSignInData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSignUpChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSignUpData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (errors[e.target.name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [e.target.name]: undefined }));
    }
  };

  // Credentials email & password sign in
  const handleCredentialsSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setGeneralError(null);

    if (!signInData.email || !signInData.password) {
      setGeneralError('Email and password are required');
      setLoading(false);
      return;
    }

    try {
      const res = await signIn('credentials', {
        email: signInData.email.trim().toLowerCase(),
        password: signInData.password,
        redirect: false,
      });

      if (res?.error) {
        setGeneralError('Invalid email or password');
        setLoading(false);
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      setGeneralError('An error occurred during sign in');
      setLoading(false);
    }
  };

  // Credentials sign up + registration
  const handleCredentialsSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    setGeneralError(null);

    // Client validation checks
    const fieldErrors: FormErrors = {};
    if (!signUpData.email.trim()) fieldErrors.email = ['Email is required'];
    if (!signUpData.password.trim()) fieldErrors.password = ['Password is required'];
    if (!signUpData.name.trim()) fieldErrors.name = ['Name is required'];
    if (!signUpData.phone_number.trim()) fieldErrors.phone_number = ['Phone number is required'];
    if (!signUpData.role) fieldErrors.role = ['Please select your role'];
    if (signUpData.role === 'other' && !signUpData.role_other_detail.trim()) {
      fieldErrors.role_other_detail = ['Please specify details for role "Other"'];
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      setLoading(false);
      return;
    }

    try {
      const signupRes = await registerCredentialsUser({
        email: signUpData.email.trim().toLowerCase(),
        name: signUpData.name.trim(),
        phone_number: signUpData.phone_number.trim(),
        role: signUpData.role,
        role_other_detail: signUpData.role === 'other' ? signUpData.role_other_detail.trim() : '',
        password: signUpData.password,
      });

      if (signupRes.success) {
        // Auto sign in user after successful signup
        const loginRes = await signIn('credentials', {
          email: signUpData.email.trim().toLowerCase(),
          password: signUpData.password,
          redirect: false,
        });

        if (loginRes?.error) {
          setGeneralError('Signup succeeded, but automatic login failed. Please sign in manually.');
          setActiveTab('signin');
          setLoading(false);
        } else {
          router.push('/');
          router.refresh();
        }
      } else {
        if (signupRes.errors) {
          setErrors(signupRes.errors as FormErrors);
        } else if (signupRes.error) {
          setGeneralError(signupRes.error);
        }
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setGeneralError('Server connection issue. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="vercel-card p-6 space-y-6 w-full">
      {/* Tabs */}
      <div className="flex border-b border-[#333] pb-1 gap-4 text-xs font-semibold">
        <button
          onClick={() => {
            setActiveTab('signin');
            setErrors({});
            setGeneralError(null);
          }}
          className={`pb-1 transition-colors duration-150 relative ${
            activeTab === 'signin' ? 'text-white border-b-2 border-white' : 'text-[#888] hover:text-white'
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => {
            setActiveTab('signup');
            setErrors({});
            setGeneralError(null);
          }}
          className={`pb-1 transition-colors duration-150 relative ${
            activeTab === 'signup' ? 'text-white border-b-2 border-white' : 'text-[#888] hover:text-white'
          }`}
        >
          Register
        </button>
      </div>

      {generalError && (
        <div className="p-3 bg-red-950/20 border border-red-900/50 rounded-md flex items-start gap-2.5 text-red-400 text-xs">
          <AlertCircle className="shrink-0 mt-0.5" size={14} />
          <span>{generalError}</span>
        </div>
      )}

      {activeTab === 'signin' ? (
        /* Sign In Tab */
        <form onSubmit={handleCredentialsSignIn} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[10px] font-mono font-semibold text-[#888] uppercase">Email</label>
            <input
              type="email"
              name="email"
              value={signInData.email}
              onChange={handleSignInChange}
              placeholder="name@domain.com"
              disabled={loading}
              className="w-full px-3 py-2 vercel-input text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-mono font-semibold text-[#888] uppercase">Password</label>
            <input
              type="password"
              name="password"
              value={signInData.password}
              onChange={handleSignInChange}
              placeholder="••••••••"
              disabled={loading}
              className="w-full px-3 py-2 vercel-input text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 text-sm vercel-btn-primary flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading && <span className="h-3.5 w-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>}
            Sign In
          </button>
        </form>
      ) : (
        /* Sign Up Tab */
        <form onSubmit={handleCredentialsSignUp} className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
          <div className="space-y-1">
            <label className="block text-[10px] font-mono font-semibold text-[#888] uppercase">Email</label>
            <input
              type="email"
              name="email"
              value={signUpData.email}
              onChange={handleSignUpChange}
              placeholder="name@domain.com"
              disabled={loading}
              className="w-full px-3 py-2 vercel-input text-sm"
            />
            {errors.email && <p className="text-red-400 text-[10px] mt-0.5">{errors.email[0]}</p>}
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-mono font-semibold text-[#888] uppercase">Password</label>
            <input
              type="password"
              name="password"
              value={signUpData.password}
              onChange={handleSignUpChange}
              placeholder="Min 6 characters"
              disabled={loading}
              className="w-full px-3 py-2 vercel-input text-sm"
            />
            {errors.password && <p className="text-red-400 text-[10px] mt-0.5">{errors.password[0]}</p>}
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-mono font-semibold text-[#888] uppercase">Full Name</label>
            <input
              type="text"
              name="name"
              value={signUpData.name}
              onChange={handleSignUpChange}
              placeholder="John Doe"
              disabled={loading}
              className="w-full px-3 py-2 vercel-input text-sm"
            />
            {errors.name && <p className="text-red-400 text-[10px] mt-0.5">{errors.name[0]}</p>}
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-mono font-semibold text-[#888] uppercase">Phone Number</label>
            <input
              type="tel"
              name="phone_number"
              value={signUpData.phone_number}
              onChange={handleSignUpChange}
              placeholder="+1 (555) 000-0000"
              disabled={loading}
              className="w-full px-3 py-2 vercel-input text-sm"
            />
            {errors.phone_number && <p className="text-red-400 text-[10px] mt-0.5">{errors.phone_number[0]}</p>}
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-mono font-semibold text-[#888] uppercase">Role</label>
            <select
              name="role"
              value={signUpData.role}
              onChange={handleSignUpChange}
              disabled={loading}
              className="w-full px-3 py-2 vercel-input text-sm appearance-none bg-black cursor-pointer"
            >
              <option value="" disabled>Select your role</option>
              <option value="crew">Crew</option>
              <option value="volunteer">Volunteer</option>
              <option value="artist">Artist</option>
              <option value="vip">VIP</option>
              <option value="government">Government / Official</option>
              <option value="other">Other</option>
            </select>
            {errors.role && <p className="text-red-400 text-[10px] mt-0.5">{errors.role[0]}</p>}
          </div>

          {signUpData.role === 'other' && (
            <div className="space-y-1">
              <label className="block text-[10px] font-mono font-semibold text-[#888] uppercase">Specify Details</label>
              <textarea
                name="role_other_detail"
                value={signUpData.role_other_detail}
                onChange={handleSignUpChange}
                placeholder="Specify other purpose..."
                disabled={loading}
                rows={2}
                className="w-full px-3 py-2 vercel-input text-sm resize-none"
              />
              {errors.role_other_detail && <p className="text-red-400 text-[10px] mt-0.5">{errors.role_other_detail[0]}</p>}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 text-sm vercel-btn-primary flex items-center justify-center gap-2 mt-4 cursor-pointer"
          >
            {loading && <span className="h-3.5 w-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>}
            Submit
          </button>
        </form>
      )}
    </div>
  );
}
