'use client';

import { useState } from 'react';
import { registerUser } from '@/app/actions';
import { useRouter } from 'next/navigation';
import { Car, User, Phone, Briefcase, Plus, AlertCircle } from 'lucide-react';

interface FormErrors {
  name?: string[];
  phone_number?: string[];
  role?: string[];
  role_other_detail?: string[];
}

export function RegistrationForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    phone_number: '',
    role: '',
    role_other_detail: '',
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear specific error on change
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    setGeneralError(null);

    // Client-side quick checks
    const fieldErrors: FormErrors = {};
    if (!formData.name.trim()) {
      fieldErrors.name = ['Name is required'];
    }
    if (!formData.phone_number.trim()) {
      fieldErrors.phone_number = ['Phone number is required'];
    }
    if (!formData.role) {
      fieldErrors.role = ['Please select a role'];
    }
    if (formData.role === 'other' && !formData.role_other_detail.trim()) {
      fieldErrors.role_other_detail = ['Please specify other role detail'];
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      setLoading(false);
      return;
    }

    // Call server action
    try {
      const response = await registerUser({
        name: formData.name.trim(),
        phone_number: formData.phone_number.trim(),
        role: formData.role,
        role_other_detail: formData.role === 'other' ? formData.role_other_detail.trim() : '',
      });

      if (response.success) {
        // Refresh page cache/router and go to ticket
        router.push('/my-code');
        router.refresh();
      } else {
        if (response.errors) {
          setErrors(response.errors as FormErrors);
        } else if (response.error) {
          setGeneralError(response.error);
        } else {
          setGeneralError('Registration failed. Please check inputs.');
        }
        setLoading(false);
      }
    } catch (err) {
      console.error('Registration submission error:', err);
      setGeneralError('An unexpected server error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {generalError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3 text-rose-400 text-sm">
          <AlertCircle className="shrink-0 mt-0.5" size={18} />
          <span>{generalError}</span>
        </div>
      )}

      {/* Name Input */}
      <div className="space-y-2">
        <label htmlFor="name" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Full Name
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
            <User size={18} />
          </div>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="John Doe"
            disabled={loading}
            className={`w-full pl-11 pr-4 py-3.5 bg-slate-900/60 border ${
              errors.name ? 'border-rose-500/50 focus:border-rose-500' : 'border-slate-800 focus:border-emerald-500/80'
            } rounded-2xl text-slate-100 placeholder-slate-500 focus:ring-1 focus:ring-emerald-500/30 outline-none transition-all duration-200`}
          />
        </div>
        {errors.name && (
          <p className="text-rose-400 text-xs mt-1 pl-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
            {errors.name[0]}
          </p>
        )}
      </div>

      {/* Phone Input */}
      <div className="space-y-2">
        <label htmlFor="phone_number" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Phone Number
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
            <Phone size={18} />
          </div>
          <input
            type="tel"
            id="phone_number"
            name="phone_number"
            value={formData.phone_number}
            onChange={handleChange}
            placeholder="+1 (555) 000-0000"
            disabled={loading}
            className={`w-full pl-11 pr-4 py-3.5 bg-slate-900/60 border ${
              errors.phone_number ? 'border-rose-500/50 focus:border-rose-500' : 'border-slate-800 focus:border-emerald-500/80'
            } rounded-2xl text-slate-100 placeholder-slate-500 focus:ring-1 focus:ring-emerald-500/30 outline-none transition-all duration-200`}
          />
        </div>
        {errors.phone_number && (
          <p className="text-rose-400 text-xs mt-1 pl-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
            {errors.phone_number[0]}
          </p>
        )}
      </div>

      {/* Role Select */}
      <div className="space-y-2">
        <label htmlFor="role" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Event Role
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
            <Briefcase size={18} />
          </div>
          <select
            id="role"
            name="role"
            value={formData.role}
            onChange={handleChange}
            disabled={loading}
            className={`w-full pl-11 pr-10 py-3.5 bg-slate-900/60 border ${
              errors.role ? 'border-rose-500/50 focus:border-rose-500' : 'border-slate-800 focus:border-emerald-500/80'
            } rounded-2xl text-slate-100 placeholder-slate-500 focus:ring-1 focus:ring-emerald-500/30 outline-none appearance-none transition-all duration-200`}
          >
            <option value="" disabled className="bg-slate-950">Select your role</option>
            <option value="crew" className="bg-slate-950">Crew</option>
            <option value="volunteer" className="bg-slate-950">Volunteer</option>
            <option value="artist" className="bg-slate-950">Artist</option>
            <option value="vip" className="bg-slate-950">VIP</option>
            <option value="government" className="bg-slate-950">Government / Official</option>
            <option value="other" className="bg-slate-950">Other</option>
          </select>
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-500">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {errors.role && (
          <p className="text-rose-400 text-xs mt-1 pl-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
            {errors.role[0]}
          </p>
        )}
      </div>

      {/* Conditional Other Detail Textarea */}
      {formData.role === 'other' && (
        <div className="space-y-2 animate-fadeIn duration-200">
          <label htmlFor="role_other_detail" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Specify Role Details
          </label>
          <div className="relative">
            <div className="absolute top-3.5 left-0 pl-4 flex items-start pointer-events-none text-slate-500">
              <Plus size={18} />
            </div>
            <textarea
              id="role_other_detail"
              name="role_other_detail"
              value={formData.role_other_detail}
              onChange={handleChange}
              placeholder="Please specify your organization or purpose..."
              disabled={loading}
              rows={3}
              className={`w-full pl-11 pr-4 py-3 bg-slate-900/60 border ${
                errors.role_other_detail ? 'border-rose-500/50 focus:border-rose-500' : 'border-slate-800 focus:border-emerald-500/80'
              } rounded-2xl text-slate-100 placeholder-slate-500 focus:ring-1 focus:ring-emerald-500/30 outline-none transition-all duration-200 resize-none`}
            />
          </div>
          {errors.role_other_detail && (
            <p className="text-rose-400 text-xs mt-1 pl-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
              {errors.role_other_detail[0]}
            </p>
          )}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 mt-8 px-6 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-emerald-950/20 active:scale-[0.98] transition-all duration-200 text-lg border border-emerald-500/30"
      >
        {loading ? (
          <span className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        ) : (
          <Car size={20} />
        )}
        {loading ? 'Registering Vehicle...' : 'Complete Registration'}
      </button>
    </form>
  );
}
