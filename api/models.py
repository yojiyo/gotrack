from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, UniqueConstraint, func, Float
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime
import uuid

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(String)
    role = Column(String, default="HR Manager")

class Client(Base):
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    contact_email = Column(String)
    company_details = Column(Text, nullable=True)
    
    projects = relationship("Project", back_populates="client")

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"))
    
    client = relationship("Client", back_populates="projects")
    tasks = relationship("Task", back_populates="project")

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    status = Column(String, default="To Do")
    project_id = Column(Integer, ForeignKey("projects.id"))
    
    project = relationship("Project", back_populates="tasks")

class Job(Base):
    __tablename__ = "jobs"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    department = Column(String)
    location = Column(String)
    status = Column(String, default="Open")
    posted_at = Column(String)

    __table_args__ = (
        UniqueConstraint('title', 'department', 'location', name='_title_dept_loc_uc'),
    )

class Candidate(Base):
    __tablename__ = "candidates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    role = Column(String)
    email = Column(String, default="N/A")
    phone = Column(String, nullable=True)
    location = Column(String, nullable=True, default="N/A")
    linkedin_url = Column(String, nullable=True)
    portfolio_url = Column(String, nullable=True)
    resume_url = Column(String, nullable=True) 
    status = Column(String, default="Applied")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class TimeLog(Base):
    __tablename__ = "time_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String)
    log_type = Column(String)
    timestamp = Column(String)
    date = Column(String)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, index=True)
    email = Column(String, unique=True)
    department = Column(String)
    position = Column(String)
    join_date = Column(String)
    salary = Column(Integer)
    status = Column(String, default="Active")
    phone_number = Column(String, nullable=True, default="N/A")
    address = Column(String, nullable=True, default="N/A")

class Attendance(Base):
    __tablename__ = "attendance"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"))
    clock_in = Column(DateTime, default=datetime.utcnow)
    clock_out = Column(DateTime, nullable=True)
    date = Column(String)

class AdminActionLog(Base):
    __tablename__ = "admin_action_logs"
    id = Column(Integer, primary_key=True, index=True)
    admin_email = Column(String)
    action = Column(String)
    details = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
class Schedule(Base):
    __tablename__ = "schedules"
    id = Column(Integer, primary_key=True, index=True)
    candidate_name = Column(String)
    role = Column(String)
    date = Column(String, default="Not Set")
    time = Column(String, default="Not Set")
    duration = Column(Integer, default=60)
    response_status = Column(String, default="Pending")
    token = Column(String, unique=True, nullable=True)
    requested_date = Column(String, nullable=True)
    requested_time = Column(String, nullable=True)
    zoom_link = Column(String, nullable=True)

class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(Integer, primary_key=True, index=True)
    action = Column(String)
    details = Column(String)
    icon_type = Column(String)
    timestamp = Column(DateTime, default=datetime.now)

class Screenshot(Base):
    __tablename__ = "screenshots"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("users.id"))
    image_url = Column(String) 
    created_at = Column(DateTime, default=datetime.now)

    
class CandidateActivityLog(Base):
    __tablename__ = "candidate_activity_logs"
    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"))
    status = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)

class EmployeeCycle(Base):
    __tablename__ = "employee_cycles"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"))
    full_name = Column(String)
    position = Column(String)
    department = Column(String)
    stage = Column(String, default="Pre-Employment")  # Pre-Employment, Onboarding, Regularization, Exit Interview, Departure
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    employee = relationship("Employee", backref="cycle")


class PayrollRecord(Base):
    __tablename__ = "payroll_records"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"))
    employee_email = Column(String, index=True)
    salary_type = Column(String)  # hourly or monthly
    salary_rate = Column(Float)
    period_start = Column(String)  # YYYY-MM-DD
    period_end = Column(String)    # YYYY-MM-DD
    total_hours = Column(Float, default=0)
    gross_pay = Column(Float, default=0)
    deductions = Column(Float, default=0)
    net_pay = Column(Float, default=0)
    leave_days = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"))
    employee_email = Column(String, index=True)
    employee_name = Column(String)
    leave_type = Column(String)  # Sick Leave, Vacation Leave, Emergency Leave
    start_date = Column(String)  # YYYY-MM-DD
    end_date = Column(String)    # YYYY-MM-DD
    days_count = Column(Float, default=1)
    reason = Column(Text, nullable=True)
    status = Column(String, default="Pending")  # Pending, Approved, Rejected
    reviewed_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    employee = relationship("Employee", backref="leave_requests")
