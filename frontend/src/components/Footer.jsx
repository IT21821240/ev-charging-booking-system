import React from 'react'
export default function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-3 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} EV Charging System. All rights reserved.
      </div>
    </footer>
  );
}
