import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '@/assets/logo.png'; 

const NavBrand = () => {
  return (
    <Link
      to="/dashboard"
      className="flex items-center gap-3 group hover:opacity-90 transition-opacity duration-200"
    >
      {/* Custom Logo */}
      {/* <div className="h-10 w-10 flex items-center justify-center rounded-xl shadow-md ring-1 ring-primary-900/20 bg-white dark:bg-gray-900 group-hover:scale-105 transition-transform duration-200">
        <img src={Logo} alt="PACT Logo" className="h-6 w-6 object-contain" />
      </div> */}

      {/* Brand Text */}
      {/* <div className="flex flex-col leading-tight">
        <span className="font-display font-bold text-lg text-neutral-800 dark:text-neutral-100">
          PACT Command Center
        </span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
          Advanced MMP Management
        </span>
      </div> */}
    </Link>
  );
};

export default NavBrand;
