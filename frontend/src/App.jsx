import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ImportPage from './pages/ImportPage'
import ProjectsPage from './pages/ProjectsPage'
import PackageDashboardPage from './pages/PackageDashboardPage'
import PackageListPage from './pages/PackageListPage'
import VendorsPage from './pages/VendorsPage'
import DealerUnlockPage from './pages/DealerUnlockPage'
import DealerBidPage from './pages/DealerBidPage'
import ComparisonPage from './pages/ComparisonPage'
import PublicBidPackagePage from './pages/PublicBidPackagePage'
import DesignerHandoffPage from './pages/DesignerHandoffPage'

const utilityNavItems = [
  { to: '/vendors', label: 'Vendors' },
  { to: '/projects', label: 'Projects' }
]

export default function App() {
  const location = useLocation()
  const isBidderPath = /^\/invite\/[^/]+(?:\/bid)?$/.test(location.pathname)
  const isPublicPath = /^\/public\/bid-packages\/[^/]+$/.test(location.pathname)
  const isFocusedComparisonPath = location.pathname === '/comparison' && /[?&]bid_package_id=/.test(location.search || '')
  const hideTopbar = isBidderPath || isPublicPath || isFocusedComparisonPath
  const [showUtilityNav, setShowUtilityNav] = useState(false)

  useEffect(() => {
    setShowUtilityNav(false)
  }, [location.pathname, location.search])

  return (
    <div className={`app-shell ${hideTopbar ? 'app-shell-bidder' : ''}`.trim()}>
      {hideTopbar ? null : (
        <header className="topbar">
          <div>
            <p className="eyebrow">Designer Pages Prototype</p>
            <h1>Bid Collections</h1>
          </div>
          <nav className="topnav topnav-management">
            <NavLink to="/import" className={({ isActive }) => (isActive ? 'active' : '')}>
              Import Package
            </NavLink>
            <NavLink to="/package" className={({ isActive }) => (isActive ? 'active' : '')}>
              Bid Management
            </NavLink>
            <div className="topnav-utility-wrap">
              <button
                type="button"
                className="topnav-utility-trigger"
                onClick={() => setShowUtilityNav((prev) => !prev)}
                aria-expanded={showUtilityNav}
                aria-label="Open utility navigation"
                title="Vendors, Projects, Import Package"
              >
                ◧
              </button>
              {showUtilityNav ? (
                <div className="topnav-utility-menu">
                  {utilityNavItems.map((item) => (
                    <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          </nav>
        </header>
      )}

      <main className={`content ${hideTopbar ? 'no-topbar' : ''}`.trim()}>
        <Routes>
          <Route path="/" element={<Navigate to="/import" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/vendors" element={<VendorsPage />} />
          <Route path="/package" element={<PackageListPage />} />
          <Route path="/package/:bidPackageId" element={<PackageDashboardPage />} />
          <Route path="/invite/:token" element={<DealerUnlockPage />} />
          <Route path="/invite/:token/bid" element={<DealerBidPage />} />
          <Route path="/public/bid-packages/:token" element={<PublicBidPackagePage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
          <Route path="/design-handoff/designer-bidders-comparison" element={<DesignerHandoffPage />} />
        </Routes>
      </main>
    </div>
  )
}
