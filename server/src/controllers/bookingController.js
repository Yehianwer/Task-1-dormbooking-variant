import Joi from 'joi';
import mongoose from 'mongoose';
import { Booking } from '../models/Booking.js';

const objectId = Joi.string().hex().length(24);

const bookingFields = {
  roomNumber: Joi.string().trim().min(1),
  startDate: Joi.date(),
  endDate: Joi.date(),
  purpose: Joi.string(),
  bookedBy: objectId
};

const createSchema = Joi.object({
  ...bookingFields,
  roomNumber: bookingFields.roomNumber.required(),
  startDate: bookingFields.startDate.required(),
  endDate: bookingFields.endDate.required()
});

const updateSchema = Joi.object(bookingFields).min(1);

function hasValidDateRange(startDate, endDate) {
  return startDate < endDate;
}

function isValidBookingId(id) {
  return mongoose.isObjectIdOrHexString(id);
}

async function findConflict(roomNumber, startDate, endDate, excludedId) {
  const query = {
    roomNumber,
    // Ranges overlap only when each starts before the other one ends.
    startDate: { $lt: endDate },
    endDate: { $gt: startDate }
  };

  if (excludedId) query._id = { $ne: excludedId };
  return Booking.findOne(query);
}

// GET /api/bookings
export async function getAllBookings(req, res, next) {
  try {
    const bookings = await Booking.find()
      .populate('bookedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json({ bookings });
  } catch (err) { next(err); }
}

// GET /api/bookings/:id
export async function getBooking(req, res, next) {
  try {
    if (!isValidBookingId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid booking ID' });
    }

    const booking = await Booking.findById(req.params.id)
      .populate('bookedBy', 'name email');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ booking });
  } catch (err) { next(err); }
}

// POST /api/bookings
export async function createBooking(req, res, next) {
  try {
    const { value, error } = createSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ message: error.message });

    if (!hasValidDateRange(value.startDate, value.endDate)) {
      return res.status(400).json({ message: 'startDate must be earlier than endDate' });
    }

    const conflict = await findConflict(value.roomNumber, value.startDate, value.endDate);
    if (conflict) {
      return res.status(409).json({ message: 'Booking conflicts with an existing booking for this room' });
    }

    const booking = await Booking.create(value);
    res.status(201).json({ booking });
  } catch (err) { next(err); }
}

// PATCH /api/bookings/:id
export async function updateBooking(req, res, next) {
  try {
    if (!isValidBookingId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid booking ID' });
    }

    const { value, error } = updateSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ message: error.message });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const roomNumber = value.roomNumber ?? booking.roomNumber;
    const startDate = value.startDate ?? booking.startDate;
    const endDate = value.endDate ?? booking.endDate;

    if (!hasValidDateRange(startDate, endDate)) {
      return res.status(400).json({ message: 'startDate must be earlier than endDate' });
    }

    const conflict = await findConflict(roomNumber, startDate, endDate, booking._id);
    if (conflict) {
      return res.status(409).json({ message: 'Booking conflicts with an existing booking for this room' });
    }

    Object.assign(booking, value);
    await booking.save();
    res.json({ booking });
  } catch (err) { next(err); }
}

// DELETE /api/bookings/:id
export async function deleteBooking(req, res, next) {
  try {
    if (!isValidBookingId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid booking ID' });
    }

    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}
