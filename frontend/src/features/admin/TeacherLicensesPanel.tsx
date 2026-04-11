import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings } from 'lucide-react';
import { toast } from 'sonner';
import { adminAPI } from '@/services/api';

interface TeacherLicensesPanelProps {
  teachers: any[];
  onRefreshTeachers: () => void;
}

export const TeacherLicensesPanel: React.FC<TeacherLicensesPanelProps> = ({ teachers, onRefreshTeachers }) => {
  const [editingTeacher, setEditingTeacher] = useState<any | null>(null);
  const [newLimit, setNewLimit] = useState<number>(10);
  const [newPlan, setNewPlan] = useState<string>('basic');

  const handleUpdateTeacherLimits = async () => {
    if (!editingTeacher) return;
    try {
      await adminAPI.updateTeacherLimits(editingTeacher.id, {
        max_students: newLimit,
        plan_type: newPlan
      });
      toast.success('Teacher limits updated!');
      setEditingTeacher(null);
      onRefreshTeachers();
    } catch (error: any) {
      toast.error('Failed to update limits: ' + error.message);
    }
  };

  return (
    <div className="space-y-4">
      {editingTeacher ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit License: {editingTeacher.full_name}</CardTitle>
            <CardDescription>Manage student limits and plan tier</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Max Students</Label>
              <Input
                type="number"
                value={newLimit}
                onChange={(e) => setNewLimit(parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Plan Type</Label>
              <select
                className="w-full p-2 rounded border bg-white dark:bg-slate-900"
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value)}
              >
                <option value="basic">Basic (Free)</option>
                <option value="premium">Premium</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpdateTeacherLimits}>Save Changes</Button>
              <Button variant="outline" onClick={() => setEditingTeacher(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4">
        {teachers.map((teacher) => (
          <Card key={teacher.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {teacher.full_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{teacher.full_name}</h3>
                    <p className="text-sm text-slate-500">{teacher.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <p className="text-xs text-slate-500 uppercase">Plan</p>
                    <Badge variant="secondary" className="capitalize">
                      {teacher.teacher_profile?.plan_type || 'basic'}
                    </Badge>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500 uppercase">Usage</p>
                    <p className="font-semibold">
                      {teacher.teacher_profile?.current_student_count} / {teacher.teacher_profile?.max_students}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingTeacher(teacher);
                      setNewLimit(teacher.teacher_profile?.max_students || 10);
                      setNewPlan(teacher.teacher_profile?.plan_type || 'basic');
                    }}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
