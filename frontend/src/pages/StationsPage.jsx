import React, { useEffect, useState } from "react";
import { stations } from "../api/client";

export default function StationsPage() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name:"", type:"AC", totalSlots:1, lat:"", lng:"" });
  const [msg, setMsg] = useState("");

  async function load(){ try { setList(await stations.list()); } catch(e){ setMsg(e.message); } }
  useEffect(()=>{ load(); },[]);

  async function onCreate(e){ e.preventDefault(); setMsg("");
    try {
      await stations.create({
        ...form,
        totalSlots: Number(form.totalSlots) || 1,
        lat: form.lat ? Number(form.lat) : null,
        lng: form.lng ? Number(form.lng) : null,
      });
      setForm({ name:"", type:"AC", totalSlots:1, lat:"", lng:"" });
      await load(); setMsg("Created");
    } catch(err){ setMsg(err.message); }
  }

  async function onUpdate(s){
    setMsg("");
    try {
      await stations.update(s.id, {
        name: s.name,
        type: s.type,
        totalSlots: Number(s.totalSlots) || 1,
        lat: (s.lat ?? null),
        lng: (s.lng ?? null),
      });
      await load(); setMsg("Updated");
    } catch(err){ setMsg(err.message); }
  }

  async function onDeactivate(s){
    setMsg("");
    try { await stations.deactivate(s.id); await load(); setMsg("Deactivated"); }
    catch(err){ setMsg(err.message); } // will show the “active bookings exist” message from backend
  }

  async function onReactivate(s){
    setMsg("");
    try { await stations.reactivate(s.id); await load(); setMsg("Reactivated"); }
    catch(err){ setMsg(err.message); }
  }

  return (
    <div>
      <div className="p-6 space-y-6">
        <h2 className="text-2xl font-semibold">Stations</h2>

        <div className="border p-4 rounded space-y-2">
          <div className="font-medium">Create Station</div>
          <form onSubmit={onCreate} className="grid gap-2">
            <input className="border p-2" placeholder="Name" value={form.name} onChange={e=>setForm({...form, name:e.target.value})}/>
            <select className="border p-2" value={form.type} onChange={e=>setForm({...form, type:e.target.value})}>
              <option>AC</option><option>DC</option>
            </select>
            <input className="border p-2" placeholder="Total Slots" value={form.totalSlots} onChange={e=>setForm({...form, totalSlots:e.target.value})}/>
            <input className="border p-2" placeholder="Lat (optional)" value={form.lat} onChange={e=>setForm({...form, lat:e.target.value})}/>
            <input className="border p-2" placeholder="Lng (optional)" value={form.lng} onChange={e=>setForm({...form, lng:e.target.value})}/>
            <button className="px-3 py-2 bg-gray-900 text-white rounded">Create</button>
          </form>
        </div>

        <div className="border p-4 rounded space-y-2">
          <div className="font-medium">All Stations</div>
          <div className="space-y-3">
            {list.map(s=>(
              <div key={s.id} className="border p-3 rounded space-y-2">
                <div className="font-medium">
                  {s.name} ({s.type}) — Slots: {s.totalSlots} — {s.isActive ? "Active":"Inactive"}
                </div>
                <div className="grid md:grid-cols-2 gap-2">
                  <input className="border p-2" value={s.name||""} onChange={e=>s.name=e.target.value}/>
                  <select className="border p-2" value={s.type||"AC"} onChange={e=>s.type=e.target.value}>
                    <option>AC</option><option>DC</option>
                  </select>
                  <input className="border p-2" value={s.totalSlots||1} onChange={e=>s.totalSlots=Number(e.target.value)||1}/>
                  <input className="border p-2" value={s.lat ?? ""} onChange={e=>s.lat=e.target.value?Number(e.target.value):null} placeholder="Lat"/>
                  <input className="border p-2" value={s.lng ?? ""} onChange={e=>s.lng=e.target.value?Number(e.target.value):null} placeholder="Lng"/>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>onUpdate(s)} className="px-3 py-2 bg-blue-600 text-white rounded">Update</button>
                  {s.isActive
                    ? <button onClick={()=>onDeactivate(s)} className="px-3 py-2 bg-red-600 text-white rounded">Deactivate</button>
                    : <button onClick={()=>onReactivate(s)} className="px-3 py-2 bg-green-600 text-white rounded">Reactivate</button>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {msg && <div className="text-sm text-gray-700">{msg}</div>}
      </div>
    </div>
  );
}
