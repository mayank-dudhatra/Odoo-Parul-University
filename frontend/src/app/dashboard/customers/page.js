"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Users,
  Search,
  Award,
  DollarSign,
  ShoppingBag,
  Phone,
  Mail,
  User,
  Coffee,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import CoffeeLoader from "@/components/ui/CoffeeLoader";

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomersCount, setTotalCustomersCount] = useState(0);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset page on new search
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';
      const token = localStorage.getItem('token');

      const queryParams = new URLSearchParams({
        page: currentPage,
        limit: 20
      });

      if (debouncedSearchQuery) {
        queryParams.append('search', debouncedSearchQuery);
      }

      const response = await fetch(`${API_URL}/dashboard/customers?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.data && result.pagination) {
          setCustomers(result.data);
          setTotalPages(result.pagination.totalPages || 1);
          setTotalCustomersCount(result.pagination.total || 0);
        } else {
          setCustomers(result);
          setTotalPages(1);
          setTotalCustomersCount(result.length || 0);
        }
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [currentPage, debouncedSearchQuery]);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }),
    []
  );

  const formatCurrency = (value = 0) => currencyFormatter.format(value || 0);

  const vipCount = useMemo(() => {
    return customers.filter(c => c.totalSpent > 2000 || c.totalOrders > 5).length;
  }, [customers]);

  const totalRevenueSum = useMemo(() => {
    return customers.reduce((sum, c) => sum + c.totalSpent, 0);
  }, [customers]);

  return (
    <div className="space-y-8">
      {/* ═══════════════════════════════════════════════════════ */}
      {/*  HERO SECTION                                         */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="flex flex-col xl:flex-row gap-6">
        {/* Left — Hero Text */}
        <div className="relative flex-1 bg-[#FDFCF7] rounded-[40px] p-8 lg:p-12 shadow-[0_4px_20px_rgba(62,43,33,0.02)] border border-[#EBE4D5]/60 overflow-hidden flex flex-col justify-center min-h-[220px]">
          <div className="relative z-10 max-w-lg space-y-5">
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#FCF8F2] text-[#3E2B21] text-sm font-semibold border border-[#EBE4D5]">
              <Users className="h-4 w-4" /> CRM & Loyalty
            </div>

            <div>
              <h1 className="text-3xl lg:text-[44px] font-black leading-[1.15] text-[#3E2B21] font-serif tracking-tight">
                Customer Directory
              </h1>
              <p className="text-[#3E2B21]/60 text-base mt-3 font-medium leading-relaxed max-w-md">
                Identify VIP spenders, monitor loyalty trends, and build lasting relationships with your guests.
              </p>
            </div>
          </div>

          <img
            src="/customers_hero_1781584330619.png"
            alt="Coffee"
            className="absolute -right-16 -bottom-10 h-[130%] object-contain opacity-30 pointer-events-none"
          />
        </div>

        {/* Right — Stats */}
        <div className="w-full xl:w-[380px] flex flex-col gap-4">
          <div className="rounded-[28px] bg-white border border-[#EBE4D5] p-5 shadow-[0_4px_20px_rgba(62,43,33,0.02)] flex flex-col justify-center">
            <p className="text-[#3E2B21]/50 text-[12px] font-bold tracking-wide">Total Customers</p>
            <div className="flex items-end justify-between mt-2">
              <p className="text-[28px] font-black text-[#3E2B21] leading-none">{totalCustomersCount}</p>
              <div className="h-9 w-9 rounded-full bg-[#F3EDE5] flex items-center justify-center text-[#6B4423]">
                <Users className="h-4 w-4" />
              </div>
            </div>
          </div>
          <div className="rounded-[28px] bg-white border border-[#EBE4D5] p-5 shadow-[0_4px_20px_rgba(62,43,33,0.02)] flex flex-col justify-center">
            <p className="text-[#3E2B21]/50 text-[12px] font-bold tracking-wide">VIP Customers</p>
            <div className="flex items-end justify-between mt-2">
              <p className="text-[28px] font-black text-[#3E2B21] leading-none">{vipCount}</p>
              <div className="h-9 w-9 rounded-full bg-[#FFF4E5] flex items-center justify-center text-[#E68A00]">
                <Award className="h-4 w-4" />
              </div>
            </div>
            <p className="text-[10px] text-[#3E2B21]/40 font-medium mt-2">Spent &gt; ₹2,000 or 5+ orders</p>
          </div>
          <div className="rounded-[28px] bg-white border border-[#EBE4D5] p-5 shadow-[0_4px_20px_rgba(62,43,33,0.02)]">
            <p className="text-[#3E2B21]/50 text-[12px] font-bold tracking-wide">Page Total Spend</p>
            <div className="flex items-end justify-between mt-2">
              <p className="text-[28px] font-black text-[#3E2B21] leading-none">{formatCurrency(totalRevenueSum)}</p>
              <div className="flex items-center gap-1 text-green-600">
                <ArrowUpRight className="h-4 w-4" />
                <span className="text-xs font-bold">Revenue</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  SEARCH                                               */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="rounded-[32px] bg-white border border-[#EBE4D5]/60 shadow-[0_4px_20px_rgba(62,43,33,0.02)] p-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#3E2B21]/30 h-5 w-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, or mobile number..."
              className="w-full pl-12 pr-4 py-3.5 rounded-[20px] border border-[#EBE4D5] focus:border-[#3E2B21]/30 focus:outline-none focus:ring-2 focus:ring-[#3E2B21]/10 transition-all bg-[#FDFCF7] text-sm font-medium text-[#3E2B21] placeholder:text-[#3E2B21]/30"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EBE4D5]/60 pt-4 text-sm text-[#3E2B21]/50 font-medium">
          <p>
            Showing <span className="font-bold text-[#3E2B21]">{customers.length}</span> of{" "}
            <span className="font-bold text-[#3E2B21]">{totalCustomersCount}</span> customers
          </p>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F5EFE6] text-[#3E2B21] text-xs font-bold">
            Page {currentPage} of {totalPages}
          </span>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  CUSTOMERS TABLE                                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="rounded-[32px] bg-white border border-[#EBE4D5]/60 shadow-[0_4px_20px_rgba(62,43,33,0.02)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <CoffeeLoader size="lg" text="Brewing customers data..." />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-24 space-y-4">
            <div className="h-16 w-16 rounded-full bg-[#F5EFE6] flex items-center justify-center mx-auto">
              <Users className="h-8 w-8 text-[#3E2B21]/30" />
            </div>
            <p className="text-[#3E2B21]/60 text-lg font-bold">No customers match this search</p>
            <p className="text-sm text-[#3E2B21]/40 font-medium">Try keywords like name, email, or phone number.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#FDFCF7] border-b border-[#EBE4D5]/60">
                    {[
                      "Customer",
                      "Email",
                      "Mobile",
                      "Orders",
                      "Total Spend",
                      "Segment",
                    ].map((head) => (
                      <th key={head} className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-widest text-[#3E2B21]/40">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customers.map((cust, idx) => {
                    const isVIP = cust.totalSpent > 2000 || cust.totalOrders > 5;
                    return (
                      <tr
                        key={idx}
                        className={`transition-colors duration-200 hover:bg-[#FDFCF7] ${idx !== customers.length - 1 ? "border-b border-[#EBE4D5]/40" : ""}`}
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-[#3E2B21] flex items-center justify-center text-white text-[12px] font-bold">
                              {(cust.name || "?")[0].toUpperCase()}
                            </div>
                            <span className="font-bold text-[#3E2B21] text-sm">{cust.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="flex items-center gap-2 text-sm text-[#3E2B21]/60 font-medium">
                            <Mail className="h-3.5 w-3.5 text-[#3E2B21]/30" />
                            {cust.email}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className="flex items-center gap-2 text-sm text-[#3E2B21]/60 font-medium">
                            <Phone className="h-3.5 w-3.5 text-[#3E2B21]/30" />
                            {cust.mobile}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className="flex items-center gap-2 text-sm text-[#3E2B21]/70 font-semibold">
                            <ShoppingBag className="h-3.5 w-3.5 text-[#3E2B21]/30" />
                            {cust.totalOrders}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className="font-black text-[#3E2B21] text-sm">
                            {formatCurrency(cust.totalSpent)}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          {isVIP ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-[#FFF4E5] text-[#B8700A] border border-[#FFE0A3]">
                              <Award className="h-3 w-3" /> VIP
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-[#F5EFE6] text-[#3E2B21]/50 border border-[#EBE4D5]">
                              Regular
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[#EBE4D5]/60 px-6 py-4">
                <p className="text-sm text-[#3E2B21]/50 font-medium">
                  Page <span className="font-bold text-[#3E2B21]">{currentPage}</span> of{" "}
                  <span className="font-bold text-[#3E2B21]">{totalPages}</span>
                  <span className="text-[#3E2B21]/30 ml-2">({totalCustomersCount} total)</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="h-9 w-9 rounded-full border border-[#EBE4D5] hover:border-[#3E2B21]/20 hover:bg-[#F5EFE6] flex items-center justify-center transition-all disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4 text-[#6B4423]" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 2 && page <= currentPage + 2)
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`h-9 min-w-9 rounded-full px-3 text-sm font-bold transition-all ${
                            page === currentPage
                              ? "bg-[#3E2B21] text-white shadow-[0_4px_12px_rgba(62,43,33,0.2)]"
                              : "text-[#3E2B21]/60 hover:bg-[#F5EFE6]"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (page === currentPage - 3 || page === currentPage + 3) {
                      return (
                        <span key={page} className="text-[#3E2B21]/30 text-sm px-1">
                          ...
                        </span>
                      );
                    }
                    return null;
                  })}
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="h-9 w-9 rounded-full border border-[#EBE4D5] hover:border-[#3E2B21]/20 hover:bg-[#F5EFE6] flex items-center justify-center transition-all disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4 text-[#6B4423]" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
