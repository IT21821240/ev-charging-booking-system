// -----------------------------------------------------------------------------
// File: BookingsRepository.cs
// Purpose: Defines a repository interface and implementation for accessing
//          and managing Booking data in the MongoDB database.
// -----------------------------------------------------------------------------
using Backend.Models;
using MongoDB.Driver;

public interface IBookingsRepository
{
    Task<Booking?> GetByIdAsync(string id);
    Task SaveAsync(Booking b);
}

public class BookingsRepository : IBookingsRepository
{
    private readonly IMongoCollection<Booking> _col;
    public BookingsRepository(IMongoDatabase db) => _col = db.GetCollection<Booking>("bookings");

    public async Task<Booking?> GetByIdAsync(string id)
        => await _col.Find(x => x.Id == id).FirstOrDefaultAsync();

    public async Task SaveAsync(Booking b)
        => await _col.ReplaceOneAsync(x => x.Id == b.Id, b);
}
