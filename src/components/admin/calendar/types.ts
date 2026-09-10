export type CalClinic = { id: string; name: string; city: string; timezone: string };
export type CalDoctor = { id: string; name: string; color: string; clinicId: string; serviceIds: string[] };
export type CalService = { id: string; name: string; durationMin: number };
export type CalPatient = { id: string; name: string; phone: string };

export type CalAppointment = {
  id: string;
  version: number;
  status: string;
  source: string;
  notes: string;
  startsAt: string;
  endsAt: string;
  patient: { id: string; firstName: string; lastName: string; phone: string };
  doctor: { id: string; name: string; title: string; color: string };
  service: { id: string; name: string; durationMin: number };
  clinic: { id: string; name: string; city: string; timezone: string };
};

export type ApiSlot = {
  startsAt: string;
  endsAt: string;
  doctorId: string;
  doctorName: string;
  clinicId: string;
  clinicName: string;
  clinicCity: string;
  timezone: string;
};
