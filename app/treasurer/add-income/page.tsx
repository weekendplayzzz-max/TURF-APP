'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { getFinancialSummaryUpdated, addIncome } from '@/lib/eventManagement';

export default function AddIncome() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [incomeName, setIncomeName] = useState('');
  const [amount, setAmount] = useState('');
  const [dateReceived, setDateReceived] = useState('');
  const [incomeSource, setIncomeSource] = useState<'sponsorship' | 'donation' | 'membership_fees' | 'fundraising' | 'other'>('sponsorship');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Financial Summary
  const [fundData, setFundData] = useState({
    totalIncome: 0,
    eventIncome: 0,
    directIncome: 0,
    totalExpenses: 0,
    availableBalance: 0,
  });
  const [loadingBalance, setLoadingBalance] = useState(true);

  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'treasurer') {
      fetchBalance();
    }
  }, [role]);

  const fetchBalance = async () => {
    try {
      setLoadingBalance(true);
      const data = await getFinancialSummaryUpdated();
      setFundData(data);
    } catch (error) {
      console.error('Error fetching balance:', error);
    } finally {
      setLoadingBalance(false);
    }
  };

  const closeSuccessDialog = () => {
    setShowSuccessDialog(false);
    setSuccessMessage('');
    // Redirect to view income page
    router.push('/treasurer/add-income');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    // Validation
    if (!incomeName.trim()) {
      setMessage({ type: 'error', text: 'Income name is required' });
      return;
    }

    const incomeAmount = parseFloat(amount);

    if (!amount || incomeAmount <= 0) {
      setMessage({ type: 'error', text: 'Please enter a valid amount greater than 0' });
      return;
    }

    if (!dateReceived) {
      setMessage({ type: 'error', text: 'Date received is required' });
      return;
    }

    const selectedDate = new Date(dateReceived);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (selectedDate > today) {
      setMessage({ type: 'error', text: 'Date received cannot be in the future' });
      return;
    }

    try {
      setSubmitting(true);

      const result = await addIncome(
        incomeName.trim(),
        incomeAmount,
        new Date(dateReceived),
        incomeSource,
        description.trim() || null,
        user?.uid || '',
        user?.email || ''
      );

      if (result.success) {
        setSuccessMessage(
          `Income "${incomeName}" (₹${incomeAmount.toLocaleString()}) added successfully!`
        );
        setShowSuccessDialog(true);

        // Reset form
        setIncomeName('');
        setAmount('');
        setDateReceived('');
        setIncomeSource('sponsorship');
        setDescription('');
        fetchBalance();
      } else {
        setMessage({ type: 'error', text: result.message || 'Failed to add income' });
      }
    } catch (error) {
      console.error('Error adding income:', error);
      setMessage({ type: 'error', text: 'Failed to add income. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user || role !== 'treasurer') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-base text-gray-700 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Success Dialog */}
      {showSuccessDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 animate-slideUp">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                Success!
              </h3>
              <p className="text-sm sm:text-base text-gray-600 break-words">
                {successMessage}
              </p>
              
              <button
                onClick={closeSuccessDialog}
                className="mt-6 w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors cursor-pointer"
              >
                View All Income
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                title="Go Back"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div className="w-9 h-9 sm:w-12 sm:h-12 flex-shrink-0">
                <Image
                  src="/logo.png"
                  alt="Art of War Logo"
                  width={48}
                  height={48}
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h1 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900">
                  Add Income
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                  Record sponsorships, donations, and other income
                </p>
              </div>
            </div>
          
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-10">
        {/* Financial Balance Card */}
      

        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 md:p-8 border border-gray-200">
          {/* Error Message */}
          {message.text && (
            <div
              className={`mb-6 p-4 rounded-lg border-l-4 animate-slideDown ${
                message.type === 'success'
                  ? 'bg-green-50 border-green-500 text-green-800'
                  : 'bg-red-50 border-red-500 text-red-800'
              }`}
            >
              <p className="text-sm font-medium">{message.text}</p>
            </div>
          )}

         

          <form onSubmit={handleSubmit}>
{/* Income Name */}
<div className="mb-6">
  <label htmlFor="incomeName" className="block text-gray-900 font-bold mb-2 text-sm sm:text-base">
    Income Name <span className="text-red-500">*</span>
  </label>
  <input
    type="text"
    id="incomeName"
    value={incomeName}
    onChange={(e) => setIncomeName(e.target.value)}
    placeholder="e.g., Annual Sponsorship from XYZ Corp"
    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-sm sm:text-base text-black"
    required
  />
</div>

{/* Income Source */}
<div className="mb-6">
  <label htmlFor="incomeSource" className="block text-gray-900 font-bold mb-2 text-sm sm:text-base">
    Income Source <span className="text-red-500">*</span>
  </label>
  <select
    id="incomeSource"
    value={incomeSource}
    onChange={(e) => setIncomeSource(e.target.value as 'sponsorship' | 'donation' | 'membership_fees' | 'fundraising' | 'other')}
    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-sm sm:text-base bg-white text-black"
    required
  >
    <option value="sponsorship">🏢 Sponsorship</option>
    <option value="donation">🎁 Donation</option>
    <option value="membership_fees">👥 Membership Fees</option>
    <option value="fundraising">📈 Fundraising</option>
    <option value="other">📦 Other</option>
  </select>
</div>

{/* Amount */}
<div className="mb-6">
  <label htmlFor="amount" className="block text-gray-900 font-bold mb-2 text-sm sm:text-base">
    Amount Received (₹) <span className="text-red-500">*</span>
  </label>
  <input
    type="number"
    id="amount"
    value={amount}
    onChange={(e) => setAmount(e.target.value)}
    placeholder="0"
    min="1"
    step="1"
    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-sm sm:text-base text-black"
    required
  />
</div>

{/* Date Received */}
<div className="mb-6">
  <label htmlFor="dateReceived" className="block text-gray-900 font-bold mb-2 text-sm sm:text-base">
    Date Received <span className="text-red-500">*</span>
  </label>
  <input
    type="date"
    id="dateReceived"
    value={dateReceived}
    onChange={(e) => setDateReceived(e.target.value)}
    max={new Date().toISOString().split('T')[0]}
    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-sm sm:text-base text-black"
    required
  />
</div>

{/* Description */}
<div className="mb-6">
  <label htmlFor="description" className="block text-gray-900 font-bold mb-2 text-sm sm:text-base">
    Description <span className="text-gray-500 text-xs sm:text-sm">(Optional)</span>
  </label>
  <textarea
    id="description"
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    placeholder="Additional details about this income..."
    rows={4}
    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-sm sm:text-base text-black"
  />
</div>


            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Adding...
                  </>
                ) : (
                  <>
                    <span>💰</span>
                    Add Income
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 sm:px-8 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-lg transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }

        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
