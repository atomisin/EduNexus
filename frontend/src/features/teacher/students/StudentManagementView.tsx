import React, { useState, useEffect } from 'react';
import { Plus, UserPlus, Users, Activity, TrendingUp, Brain, Layers, Loader2 } from 'lucide-react';
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

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">My Students</h2>
          <p className="text-slate-500 mt-1">Manage your students and track their progress</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setShowAddDialog(true)} className="btn-primary">
            <Plus className="w-4 h-4 mr-2" /> Add Student
          </Button>
          <Button onClick={() => setShowAddByIdDialog(true)} variant="outline">
            <UserPlus className="w-4 h-4 mr-2" /> Add by ID
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Students</p>
                <p className="text-2xl font-bold">{students.length}</p>
              </div>
              <Users className="w-8 h-8 text-teal-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Active This Week</p>
                <p className="text-2xl font-bold">{students.filter(s => s.last_active).length}</p>
              </div>
              <Activity className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Avg. Progress</p>
                <p className="text-2xl font-bold">0%</p>
              </div>
              <TrendingUp className="w-8 h-8 text-teal-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">AI Recommendations</p>
                <p className="text-2xl font-bold">0</p>
              </div>
              <Brain className="w-8 h-8 text-teal-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      ) : students.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600">No students yet</h3>
          <p className="text-slate-500 mt-1">Add students by email to start tracking their progress</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(
            students.reduce((acc, student) => {
              const grade = student.grade_level || 'Ungraded';
              if (!acc[grade]) acc[grade] = [];
              acc[grade].push(student);
              return acc;
            }, {} as Record<string, any[]>)
          ).sort(([gradeA], [gradeB]) => gradeA.localeCompare(gradeB))
            .map(([grade, gradeStudents]) => (
              <div key={grade} className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Layers className="w-5 h-5 text-teal-500" />
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">
                    {grade} <span className="text-sm font-normal text-slate-500">({(gradeStudents as any[]).length} students)</span>
                  </h3>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(gradeStudents as any[]).map((student: any) => (
                    <Card key={student.id} className="hover-lift">
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                          <Avatar className="w-12 h-12">
                            <AvatarFallback className="bg-teal-100 text-teal-600">
                              {student.full_name?.[0] || student.email?.[0] || 'S'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{student.full_name || 'Student'}</h3>
                            <p className="text-sm text-slate-500">{student.email}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {student.learning_style || 'Visual'} Learner
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t flex items-center justify-between">
                          <div>
                            <p className="text-xs text-slate-500">Progress</p>
                            <div className="w-24 h-2 bg-slate-200 rounded-full mt-1">
                              <div className="h-full w-1/3 bg-teal-600 rounded-full" />
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleRemoveStudent(student.id)}>
                            Remove
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
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
                  <p className="text-xs text-teal-600 font-medium">✨ We will generate a comprehensive curriculum based on this course.</p>
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

            <Button onClick={handleAddStudent} disabled={addingStudent} className="w-full btn-primary">
              {addingStudent ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {addingStudent ? 'Registering...' : 'Complete Registration'}
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
            <Button onClick={handleAddStudentById} disabled={addingStudent} className="w-full btn-primary">
              {addingStudent ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {addingStudent ? 'Adding...' : 'Add Student'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
