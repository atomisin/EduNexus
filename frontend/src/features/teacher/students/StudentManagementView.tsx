import React, { useState, useEffect, useMemo } from 'react';
import { Plus, UserPlus, Users, Activity, TrendingUp, Brain, Layers, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { teacherAPI } from '@/services/api';
import { toast } from 'sonner';
import { EDUCATION_LEVELS } from '@/constants/educationLevels';

export const StudentManagementView = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAddByIdDialog, setShowAddByIdDialog] = useState(false);
  const [editingGuardianStudent, setEditingGuardianStudent] = useState<any | null>(null);
  const [guardianContact, setGuardianContact] = useState({ guardian_name: '', guardian_email: '' });
  const [addingStudent, setAddingStudent] = useState(false);
  const [studentIdInput, setStudentIdInput] = useState('');
  const [newStudent, setNewStudent] = useState({
    full_name: '',
    username: '',
    email: '',
    password: '',
    education_level: EDUCATION_LEVELS[0].value as string,
    grade_level: 'JSS 1',
    course_name: '',
    guardian_email: '',
    guardian_name: '',
    phone: '',
    school_name: '',
    curriculum_type: 'WAEC',
    notes: ''
  });

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const data = await teacherAPI.getMyLinkedStudents();
      setStudents(data.students || []);
    } catch (error) {
      console.error('Failed to load students:', error);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const studentsByGrade = useMemo(() => (
    Object.entries(
      students.reduce((acc, student) => {
        const grade = student.grade_level || 'Ungraded';
        if (!acc[grade]) acc[grade] = [];
        acc[grade].push(student);
        return acc;
      }, {} as Record<string, any[]>)
    ).sort(([gradeA], [gradeB]) => gradeA.localeCompare(gradeB))
  ), [students]);

  const handleAddStudentById = async () => {
    if (!studentIdInput.trim()) {
      toast.error('Please enter a Student ID');
      return;
    }
    setAddingStudent(true);
    try {
      const result = await teacherAPI.addStudentById(studentIdInput.trim());
      toast.success(`Student ${result.student.name} added successfully!`);
      setShowAddByIdDialog(false);
      setStudentIdInput('');
      loadStudents();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add student. Check the ID and try again.');
    } finally {
      setAddingStudent(false);
    }
  };

  const handleAddStudent = async () => {
    if (!newStudent.full_name || !newStudent.email || !newStudent.username) {
      toast.error('Please enter student name, email, and username');
      return;
    }
    if (newStudent.education_level === 'professional' && !newStudent.course_name.trim()) {
      toast.error('Please enter a course name for professional level');
      return;
    }
    setAddingStudent(true);
    try {
      await teacherAPI.registerStudent({
        full_name: newStudent.full_name,
        username: newStudent.username,
        email: newStudent.email,
        password: newStudent.password,
        phone_number: newStudent.phone,
        guardian_name: newStudent.guardian_name,
        guardian_email: newStudent.guardian_email,
        education_level: newStudent.education_level,
        grade_level: newStudent.grade_level,
        course_name: newStudent.education_level === 'professional' ? newStudent.course_name : undefined,
        school_name: newStudent.school_name,
        curriculum_type: newStudent.curriculum_type,
        notes: newStudent.notes,
      });
      toast.success('Student registered and added successfully!');
      setShowAddDialog(false);
      setNewStudent({
        full_name: '', username: '', email: '', password: '',
        education_level: EDUCATION_LEVELS[0].value, grade_level: 'JSS 1', course_name: '', guardian_email: '',
        guardian_name: '', phone: '', school_name: '', curriculum_type: 'WAEC',
        notes: ''
      });
      loadStudents();
    } catch (error: any) {
      toast.error(error.message || 'Failed to register student');
    } finally {
      setAddingStudent(false);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!confirm('Are you sure you want to remove this student?')) return;
    try {
      await teacherAPI.removeStudent(studentId);
      toast.success('Student removed');
      loadStudents();
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove student');
    }
  };

  const openGuardianEditor = (student: any) => {
    setEditingGuardianStudent(student);
    setGuardianContact({
      guardian_name: student.guardian_name || '',
      guardian_email: student.guardian_email || '',
    });
  };

  const handleUpdateGuardianContact = async () => {
    if (!editingGuardianStudent) return;
    try {
      await teacherAPI.updateStudentGuardianContact(editingGuardianStudent.id, guardianContact);
      toast.success('Report contact updated');
      setEditingGuardianStudent(null);
      loadStudents();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update report contact');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Learner roster</h2>
          <p className="text-sm text-muted-foreground">Keep your current learners, report contacts, and onboarding actions in one place.</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setShowAddDialog(true)} className="rounded-lg bg-primary hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" /> Add Student
          </Button>
          <Button onClick={() => setShowAddByIdDialog(true)} variant="outline" className="rounded-lg">
            <UserPlus className="mr-2 h-4 w-4" /> Add by ID
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-lg border border-border bg-background shadow-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Students</p>
                <p className="text-2xl font-semibold text-foreground">{students.length}</p>
              </div>
              <Users className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-lg border border-border bg-background shadow-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active This Week</p>
                <p className="text-2xl font-semibold text-foreground">{students.filter(s => s.last_active).length}</p>
              </div>
              <Activity className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-lg border border-border bg-background shadow-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. Progress</p>
                <p className="text-2xl font-semibold text-foreground">0%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-lg border border-border bg-background shadow-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">AI Recommendations</p>
                <p className="text-2xl font-semibold text-foreground">0</p>
              </div>
              <Brain className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : students.length === 0 ? (
        <Card className="rounded-lg border border-dashed border-border bg-background shadow-none">
          <CardContent className="py-12 text-center">
            <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground/35" />
            <h3 className="text-lg font-medium text-foreground">No learners linked yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Add a learner by registration or student ID to start building your roster.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {studentsByGrade.map(([grade, gradeStudents]) => (
              <section key={grade} className="space-y-4">
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <Layers className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">
                    {grade} <span className="text-sm font-normal text-muted-foreground">({(gradeStudents as any[]).length} learners)</span>
                  </h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {(gradeStudents as any[]).map((student: any) => (
                    <Card key={student.id} className="rounded-lg border border-border bg-background shadow-none">
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={student.avatar_url || student.avatar} />
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {student.full_name?.[0] || student.email?.[0] || 'S'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-semibold text-foreground">{student.full_name || student.name || 'Student'}</h3>
                            <p className="truncate text-sm text-muted-foreground">{student.email}</p>
                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3.5 w-3.5" />
                              {student.guardian_email || 'No report email set'}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 text-primary">
                                {student.learning_style || 'Visual'} learner
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 space-y-3 border-t border-border pt-4">
                          <div className="flex items-end justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Progress</p>
                              <div className="mt-2 h-2 w-28 rounded-full bg-secondary">
                                <div className="h-full w-1/3 rounded-full bg-primary" />
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">{student.last_active ? 'Recently active' : 'Waiting for fresh activity'}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" size="sm" className="rounded-md" onClick={() => openGuardianEditor(student)}>
                              Report Email
                            </Button>
                            <Button variant="ghost" size="sm" className="rounded-md text-destructive hover:bg-destructive/10" onClick={() => handleRemoveStudent(student.id)}>
                              Remove
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Register New Student</DialogTitle>
            <DialogDescription>Create a new student account and add them to your roster.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  value={newStudent.full_name}
                  onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label>Username *</Label>
                <Input
                  value={newStudent.username}
                  onChange={(e) => setNewStudent({ ...newStudent, username: e.target.value })}
                  placeholder="johndoe123"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newStudent.email}
                  onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                  placeholder="student@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Password *</Label>
                <Input
                  type="text"
                  value={newStudent.password}
                  onChange={(e) => setNewStudent({ ...newStudent, password: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Education Level</Label>
                <Select
                  value={newStudent.education_level}
                  onValueChange={(val) => setNewStudent({ ...newStudent, education_level: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {EDUCATION_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Grade/Class</Label>
                <Input
                  value={newStudent.grade_level}
                  onChange={(e) => setNewStudent({ ...newStudent, grade_level: e.target.value })}
                  placeholder="e.g., JSS 1, Grade 7"
                />
              </div>
              {newStudent.education_level === 'professional' && (
                <div className="space-y-2 col-span-2">
                  <Label>Professional Course / Certification *</Label>
                  <Input
                    value={newStudent.course_name}
                    onChange={(e) => setNewStudent({ ...newStudent, course_name: e.target.value })}
                    placeholder="e.g., Data Science, Agile Master, AWS Architect"
                    required
                  />
                  <p className="text-xs font-medium text-primary">We will generate a comprehensive curriculum based on this course.</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <div className="space-y-2">
                <Label>Guardian Name</Label>
                <Input
                  value={newStudent.guardian_name}
                  onChange={(e) => setNewStudent({ ...newStudent, guardian_name: e.target.value })}
                  placeholder="Parent/Guardian name"
                />
              </div>
              <div className="space-y-2">
                <Label>Guardian Email</Label>
                <Input
                  type="email"
                  value={newStudent.guardian_email}
                  onChange={(e) => setNewStudent({ ...newStudent, guardian_email: e.target.value })}
                  placeholder="parent@email.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Curriculum Type</Label>
                <Select
                  value={newStudent.curriculum_type}
                  onValueChange={(val) => setNewStudent({ ...newStudent, curriculum_type: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select curriculum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WAEC">WAEC</SelectItem>
                    <SelectItem value="NECO">NECO</SelectItem>
                    <SelectItem value="JAMB">JAMB</SelectItem>
                    <SelectItem value="Cambridge">Cambridge</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={newStudent.phone}
                  onChange={(e) => setNewStudent({ ...newStudent, phone: e.target.value })}
                  placeholder="+23481..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (Private)</Label>
              <Textarea
                value={newStudent.notes}
                onChange={(e) => setNewStudent({ ...newStudent, notes: e.target.value })}
                placeholder="e.g., Focus on Mathematics, needs slow pace"
              />
            </div>

            <Button onClick={handleAddStudent} disabled={addingStudent} className="w-full rounded-lg bg-primary hover:bg-primary/90">
              {addingStudent ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {addingStudent ? 'Registering...' : 'Complete Registration'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingGuardianStudent} onOpenChange={(open) => !open && setEditingGuardianStudent(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Report Contact</DialogTitle>
            <DialogDescription>
              Set where monthly progress reports should be sent for this student.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Parent / Guardian Name</Label>
              <Input
                value={guardianContact.guardian_name}
                onChange={(e) => setGuardianContact({ ...guardianContact, guardian_name: e.target.value })}
                placeholder="Parent or guardian name"
              />
            </div>
            <div className="space-y-2">
              <Label>Report Email</Label>
              <Input
                type="email"
                value={guardianContact.guardian_email}
                onChange={(e) => setGuardianContact({ ...guardianContact, guardian_email: e.target.value })}
                placeholder="parent@example.com"
              />
            </div>
            <Button onClick={handleUpdateGuardianContact} className="w-full rounded-lg bg-primary hover:bg-primary/90">
              Save Report Contact
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddByIdDialog} onOpenChange={setShowAddByIdDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Student by ID</DialogTitle>
            <DialogDescription>Enter a student's unique ID to link them to your account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Student ID</Label>
              <Input
                value={studentIdInput}
                onChange={(e) => setStudentIdInput(e.target.value)}
                placeholder="EDU-2026-XXXXXX"
              />
            </div>
            <Button onClick={handleAddStudentById} disabled={addingStudent} className="w-full rounded-lg bg-primary hover:bg-primary/90">
              {addingStudent ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {addingStudent ? 'Adding...' : 'Add Student'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
