import { Link } from 'react-router-dom'
import { TICKET_STATUSES, type TicketStatus } from '@mira/shared'
import type { Ticket } from '../api/endpoints.js'

const LABELS: Record<TicketStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  closed: 'Closed',
}

export function Board(
  { tickets, onStatusChange }: {
    tickets: Ticket[]
    onStatusChange: (id: string, status: TicketStatus) => Promise<void>
  },
) {
  return (
    <div className="board">
      {TICKET_STATUSES.map(status => {
        const column = tickets.filter(t => t.status === status)
        return (
          <section key={status} aria-label={LABELS[status]} className="board-column">
            <h2>{LABELS[status]} ({column.length})</h2>
            <ul>
              {column.map(t => (
                <li key={t.id} className="ticket">
                  <Link to={`/tickets/${t.id}`}><strong>{t.key}</strong></Link>
                  <span className="ticket-title">{t.title}</span>
                  <label>
                    Status for {t.key}
                    <select
                      value={t.status}
                      onChange={e =>
                        void onStatusChange(t.id, e.target.value as TicketStatus)}
                    >
                      {TICKET_STATUSES.map(s => (
                        <option key={s} value={s}>{LABELS[s]}</option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
