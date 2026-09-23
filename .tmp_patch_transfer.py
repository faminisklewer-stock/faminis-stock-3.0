from pathlib import Path
import re

p = Path(r'd:\faminis stock 3.0\src\App.tsx')
text = p.read_text(encoding='utf-8')
pattern = r"transfers\.map\(\(transfer\) => .*?\)</tbody>"
new_block = """transfers.map((transfer) => {
          const rows = transferItems.filter((item) => item.transfer_id === transfer.id)
          const nextStatus = actionFor(transfer)
          return <tr key={transfer.id}><td><div className=\"transfer-route\"><strong>{locationName(transfer.source_location_id)}</strong><span>→</span><strong>{locationName(transfer.destination_location_id)}</strong><small className=\"table-subline\">{transfer.notes ?? 'Tanpa catatan'}</small>{transfer.status === 'SHIPPED' && transfer.destination_location_id === profile.location_id && <div className=\"transfer-receive-box\">{rows.map((item) => {
            const draft = receiptDrafts[item.id] ?? { quantity: String(item.received_quantity ?? item.shipped_quantity), note: item.discrepancy_reason ?? '' }
            return <div key={item.id} className=\"transfer-receive-row\"><label>Terima<input type=\"number\" min=\"0\" max={item.shipped_quantity} value={draft.quantity} onChange={(event) => setReceiptDrafts((current) => ({ ...current, [item.id]: { ...draft, quantity: event.target.value } }))} /></label><label>Catatan<input value={draft.note} onChange={(event) => setReceiptDrafts((current) => ({ ...current, [item.id]: { ...draft, note: event.target.value } }))} placeholder=\"Jumlah kurang/rusak\" /></label></div>
          })}<button className=\"button button-primary\" type=\"button\" disabled={saving} onClick={() => void receiveTransfer(transfer)}>Terima transfer</button></div>}</div></td><td><span className=\"transfer-status\">{transfer.status}</span></td><td>{new Date(transfer.created_at).toLocaleDateString('id-ID')}</td><td>{nextStatus ? <button className=\"text-button\" type=\"button\" onClick={() => void transition(transfer, nextStatus)}>{nextStatus}</button> : <span className=\"table-subline\">—</span>}</td></tr>
        })}</tbody>"""
new_text, count = re.subn(pattern, new_block, text, flags=re.S, count=1)
if count != 1:
    raise SystemExit(f'expected one replacement, got {count}')
p.write_text(new_text, encoding='utf-8')
print('patched transfer table')
