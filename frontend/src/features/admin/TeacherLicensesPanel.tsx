import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    const safeLimit = Number.isFinite(newLimit) && newLimit > 0 ? newLimit : 1;
    try {
      await adminAPI.updateTeacherLimits(editingTeacher.id, {
        max_students: safeLimit,
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
      <Card className="rounded-lg border border-border bg-background shadow-none">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1.2fr_1fr]">
          <div className="space-y-2">
            <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 px-3 py-1 text-primary">
              License brief
            </Badge>
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-foreground">Manage teaching capacity with care</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                Keep teacher plans, learner limits, and room to grow visible before class demand becomes a problem.
              </p>
            </div>
          </div>
          <div className="grid gap-2 rounded-lg border border-border bg-subtle p-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Teacher profiles</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{teachers.length}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Capacity in use</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {teachers.reduce((sum, teacher) => sum + (teacher.teacher_profile?.current_student_count || 0), 0)} learners
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {editingTeacher ? (
        <Card className="rounded-lg border-border bg-background shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">Edit License: {editingTeacher.full_name || editingTeacher.email || 'Teacher'}</CardTitle>
            <CardDescription>Adjust learner capacity and plan access for this teacher.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Max Students</Label>
              <Input
                type="number"
                value={newLimit}
                min={1}
                onChange={(e) => setNewLimit(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label>Plan Type</Label>
              <Select value={newPlan} onValueChange={setNewPlan}>
                <SelectTrigger className="rounded-lg border-border bg-background">
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic (Free)</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleUpdateTeacherLimits}>Save Changes</Button>
              <Button className="rounded-lg" variant="outline" onClick={() => setEditingTeacher(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        {teachers.map((teacher) => (
          <Card key={teacher.id} className="rounded-lg border-border bg-background shadow-none">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {(teacher.full_name || teacher.email || 'T')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{teacher.full_name || 'Unnamed Teacher'}</h3>
                    <p className="text-sm text-muted-foreground truncate">{teacher.email || 'No email on record'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 md:gap-8">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Plan</p>
                    <Badge variant="secondary" className="capitalize border-primary/15 bg-primary/10 text-primary">
                      {teacher.teacher_profile?.plan_type || 'basic'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Usage</p>
                    <p className="font-semibold">
                      {teacher.teacher_profile?.current_student_count} / {teacher.teacher_profile?.max_students}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-lg"
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
