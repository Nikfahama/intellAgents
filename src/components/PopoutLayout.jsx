import { Outlet } from 'react-router-dom'

export default function PopoutLayout() {
  return (
    <div className="popout-layout">
      <main className="popout-content">
        <Outlet />
      </main>
    </div>
  )
}
