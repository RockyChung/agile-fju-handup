import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const EMAIL_DOMAIN = "@cloud.fju.edu.tw";

function makeEmail(studentId: string): string {
  return `${studentId}${EMAIL_DOMAIN}`;
}

async function upsertUser(input: {
  studentId: string;
  name: string;
  role: Role;
  plainPassword: string;
  mustChangePassword?: boolean;
}) {
  const passwordHash = await bcrypt.hash(input.plainPassword, 10);

  return prisma.user.upsert({
    where: { studentId: input.studentId },
    update: {
      name: input.name,
      role: input.role,
      email: makeEmail(input.studentId),
      passwordHash,
      mustChangePassword: input.mustChangePassword ?? false,
    },
    create: {
      studentId: input.studentId,
      email: makeEmail(input.studentId),
      passwordHash,
      name: input.name,
      role: input.role,
      mustChangePassword: input.mustChangePassword ?? false,
    },
  });
}

async function main() {
  const admin = await upsertUser({
    studentId: "admin001",
    name: "系統管理員",
    role: Role.admin,
    plainPassword: "Admin1234!",
  });

  const teacher = await upsertUser({
    studentId: "t001",
    name: "測試老師",
    role: Role.teacher,
    plainPassword: "Teacher1234!",
  });

  const studentA = await upsertUser({
    studentId: "s001",
    name: "測試學生A",
    role: Role.student,
    plainPassword: "Student1234!",
    mustChangePassword: true,
  });

  const studentB = await upsertUser({
    studentId: "s002",
    name: "測試學生B",
    role: Role.student,
    plainPassword: "Student1234!",
    mustChangePassword: true,
  });

  const course = await prisma.course.upsert({
    where: {
      teacherId_courseCode: {
        teacherId: teacher.id,
        courseCode: "CS101",
      },
    },
    update: {
      title: "程式設計導論",
      isActive: true,
    },
    create: {
      teacherId: teacher.id,
      courseCode: "CS101",
      title: "程式設計導論",
      isActive: true,
    },
  });

  await prisma.courseStudent.upsert({
    where: {
      courseId_studentId: {
        courseId: course.id,
        studentId: studentA.id,
      },
    },
    update: {},
    create: {
      courseId: course.id,
      studentId: studentA.id,
    },
  });

  await prisma.courseStudent.upsert({
    where: {
      courseId_studentId: {
        courseId: course.id,
        studentId: studentB.id,
      },
    },
    update: {},
    create: {
      courseId: course.id,
      studentId: studentB.id,
    },
  });

  console.log("Seed completed", {
    adminStudentId: admin.studentId,
    teacherStudentId: teacher.studentId,
    studentIds: [studentA.studentId, studentB.studentId],
    courseCode: course.courseCode,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
