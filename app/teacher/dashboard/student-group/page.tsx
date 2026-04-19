"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase"; 
import { useRequireTeacher } from "@/hooks/use-require-teacher";

interface Student {
  student_id: string;    
  name: string;          
  student_number: string;
  group_name?: string | null;
  group_role?: string | null;
}

interface GroupMap {
  [key: string]: Student[];
}

export default function StudentGroupingPage() {
  const router = useRouter();
  const { loading: authLoading, teacherId } = useRequireTeacher();
  
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [unassignedStudents, setUnassignedStudents] = useState<Student[]>([]);
  const [existingGroups, setExistingGroups] = useState<GroupMap>({});
  
  const [rightStudents, setRightStudents] = useState<Student[]>([]);
  const [groupName, setGroupName] = useState("");
  const [leaderId, setLeaderId] = useState<string | null>(null);
  
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const fetchCourses = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("courses")
      .select("id, title, course_code")
      .eq("teacher_id", id);
    if (error) return;
    setCourses(data ?? []);
  }, []);

  useEffect(() => {
    if (teacherId) void fetchCourses(teacherId);
  }, [teacherId, fetchCourses]);

  const loadClassData = async (course_id: string) => {
    const { data, error } = await supabase
      .from("course_students")
      .select(`
        student_id,
        group_name,
        group_role,
        profiles!inner (name, student_id)
      `)
      .eq("course_id", course_id);

    if (error) return;

    const all: Student[] = (data as any[]).map(item => ({
      student_id: item.student_id,
      name: item.profiles.name,
      student_number: item.profiles.student_id,
      group_name: item.group_name,
      group_role: item.group_role
    }));

    setUnassignedStudents(all.filter(s => !s.group_name));

    const groups: GroupMap = {};
    all.filter(s => s.group_name).forEach(s => {
      const gName = s.group_name!;
      if (!groups[gName]) groups[gName] = [];
      groups[gName].push(s);
    });
    setExistingGroups(groups);
  };

  useEffect(() => {
    if (selectedCourseId) {
      void loadClassData(selectedCourseId);
    } else {
      setUnassignedStudents([]);
      setExistingGroups({});
    }
  }, [selectedCourseId]);

  const handleCourseChange = (course_id: string) => {
    setMessage(null);
    setRightStudents([]);
    setGroupName("");
    setLeaderId(null);
    setSelectedCourseId(course_id);
  };

  // 修正點 2：取消編輯時清空訊息
  const resetEditArea = () => {
    setRightStudents([]);
    setGroupName("");
    setLeaderId(null);
    setMessage(null); // 清空「正在編輯...」或成功訊息
    if (selectedCourseId) void loadClassData(selectedCourseId);
  };

  const editGroup = (name: string, members: Student[]) => {
    setGroupName(name);
    setRightStudents([...members]);
    const leader = members.find(m => m.group_role === 'leader');
    setLeaderId(leader ? leader.student_id : null);
    setMessage({ type: 'success', text: `正在編輯組別：${name}` });
  };

  const moveToRight = (student: Student) => {
    if (rightStudents.find(s => s.student_id === student.student_id)) return;
    setRightStudents(prev => [...prev, student]);
    setUnassignedStudents(prev => prev.filter(s => s.student_id !== student.student_id));
  };

  // 修正點 1：移除時即時返回左側名單
  const moveToLeft = (student: Student) => {
    if (leaderId === student.student_id) {
      alert("⚠️ 您移除了該組組長，儲存前請重新指定一位組長！");
      setLeaderId(null);
    }

    // 將該學生從右側移除
    setRightStudents(prev => prev.filter(s => s.student_id !== student.student_id));

    // 如果該學生原本就沒有組別（即他是從左側拉進來的），則應該立即回歸左側
    // 或是如果老師正在編輯某組，把舊成員踢掉，邏輯上他也變成了「未分組」狀態
    setUnassignedStudents(prev => {
      const exists = prev.find(s => s.student_id === student.student_id);
      if (exists) return prev; // 防止重複
      return [...prev, { ...student, group_name: null, group_role: null }];
    });
  };

  const handleSaveGrouping = async () => {
    if (!groupName || rightStudents.length === 0) {
      setMessage({ type: 'error', text: "請輸入組名並選擇成員" });
      return;
    }
    if (!leaderId) {
      setMessage({ type: 'error', text: "請指定一位組長 (★)" });
      return;
    }

    setProcessing(true);
    try {
      const originalMembers = existingGroups[groupName] || [];
      const removedStudents = originalMembers.filter(
        old => !rightStudents.some(now => now.student_id === old.student_id)
      );

      if (removedStudents.length > 0) {
        const clearTasks = removedStudents.map(s => 
          supabase
            .from("course_students")
            .update({ group_name: null, group_role: null })
            .eq("course_id", selectedCourseId)
            .eq("student_id", s.student_id)
        );
        await Promise.all(clearTasks);
      }

      const saveTasks = rightStudents.map(s => 
        supabase
          .from("course_students")
          .update({
            group_name: groupName,
            group_role: leaderId === s.student_id ? "leader" : "member"
          })
          .eq("course_id", selectedCourseId)
          .eq("student_id", s.student_id)
      );
      await Promise.all(saveTasks);

      setMessage({ type: 'success', text: `組別「${groupName}」儲存成功！` });
      
      // 儲存成功後，不要立即 setMessage(null)，保留成功訊息，
      // 但清空工作區
      setRightStudents([]);
      setGroupName("");
      setLeaderId(null);
      await loadClassData(selectedCourseId); 
    } catch (err) {
      setMessage({ type: 'error', text: "儲存失敗" });
    } finally {
      setProcessing(false);
    }
  };

  if (authLoading) return <div className="p-8 text-center font-bold">載入中...</div>;

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center justify-between rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
          <div>
            <h1 className="text-2xl font-black text-slate-800">組別管理與編輯</h1>
            <p className="text-sm text-slate-500 mt-1">管理既有組別，或將新加選學生加入現有組別。</p>
          </div>
          <button 
            onClick={() => router.back()} 
            className="rounded-xl bg-slate-800 px-6 py-2.5 font-bold text-white hover:bg-slate-700 transition-all shadow-md active:scale-95"
          >
            ← 返回
          </button>
        </header>

        <section className="bg-white p-6 rounded-2xl shadow-sm border">
          <label className="block text-xs font-black text-slate-400 uppercase mb-2">步驟 1：選擇要管理的課程</label>
          <select 
            className="w-full max-w-md p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-indigo-500"
            onChange={(e) => handleCourseChange(e.target.value)}
            value={selectedCourseId}
          >
            <option value="">請選擇課程...</option>
            {courses.map(c => <option key={c.id} value={c.id}>[{c.course_code}] {c.title}</option>)}
          </select>
        </section>

        {message && (
          <div className={`p-4 rounded-xl font-bold border transition-all ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
            {message.type === 'success' ? '✅' : '⚠️'} {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 h-[350px] flex flex-col overflow-hidden shadow-sm">
              <div className="bg-indigo-50 px-5 py-4 border-b font-bold text-indigo-700">待選學生 (未分組)</div>
              <div className="flex-1 overflow-y-auto p-2">
                {unassignedStudents.length === 0 && selectedCourseId && <div className="p-10 text-center text-slate-400 text-sm">暫無待選學生</div>}
                {unassignedStudents.map(s => (
                  <div key={s.student_id} onClick={() => moveToRight(s)} className="p-3 rounded-xl hover:bg-indigo-50 cursor-pointer flex justify-between items-center group mb-1 border border-transparent hover:border-indigo-100">
                    <div>
                      <div className="font-bold text-slate-700">{s.name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{s.student_number}</div>
                    </div>
                    <span className="text-indigo-500 font-bold text-xs opacity-0 group-hover:opacity-100">+ 加入</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 h-[400px] flex flex-col overflow-hidden shadow-sm">
              <div className="bg-slate-800 px-5 py-4 border-b font-bold text-white">已分組名單 (點選編輯)</div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {Object.entries(existingGroups).map(([name, members]) => (
                  <div key={name} className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-black text-slate-700">{name}</span>
                      <button onClick={() => editGroup(name, members)} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-700">編輯成員</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {members.map(m => (
                        <span key={m.student_id} className="text-[10px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500">
                          {m.name}{m.group_role === 'leader' && ' ★'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white rounded-3xl border-2 border-indigo-600 h-[776px] flex flex-col overflow-hidden shadow-2xl relative">
            <div className="bg-indigo-600 px-6 py-5 text-white flex justify-between items-start">
              <div>
                <h2 className="font-black text-xl">編輯工作區</h2>
                <p className="text-[11px] text-indigo-100 mt-1 opacity-80">選取星星為組長，點擊 ✕ 將其移出</p>
              </div>
              {(rightStudents.length > 0 || groupName) && (
                <button onClick={resetEditArea} className="bg-white/10 hover:bg-white/20 border border-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all">✕ 取消編輯 / 清空</button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {rightStudents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                  <div className="text-6xl">📥</div>
                  <p className="font-bold">請選取學生或編輯既有組別</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {rightStudents.map(s => (
                    <div key={s.student_id} className={`p-4 rounded-2xl border flex justify-between items-center transition-all ${leaderId === s.student_id ? 'border-amber-400 bg-amber-50/50' : 'border-slate-100 bg-white shadow-sm'}`}>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setLeaderId(s.student_id)} className={`text-2xl ${leaderId === s.student_id ? 'text-amber-500' : 'text-slate-200 hover:text-amber-200'}`}>{leaderId === s.student_id ? '★' : '☆'}</button>
                        <div>
                          <div className="font-bold text-slate-700">{s.name}</div>
                          <div className="text-[10px] text-slate-400">{s.student_number}</div>
                        </div>
                      </div>
                      <button onClick={() => moveToLeft(s)} className="text-slate-300 hover:text-rose-500 p-1">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50 border-t space-y-4">
              <input 
                type="text"
                placeholder="例如：第一組"
                className="w-full p-4 rounded-xl border-2 border-slate-200 outline-none focus:border-indigo-600 font-bold"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
              <button 
                onClick={handleSaveGrouping}
                disabled={processing || rightStudents.length === 0}
                className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black text-lg hover:bg-indigo-700 disabled:bg-slate-200 transition-all"
              >
                {processing ? '儲存中...' : '確認儲存並更新組別'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}