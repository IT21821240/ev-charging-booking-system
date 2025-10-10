// -----------------------------------------------------------------------------
// File: StationsController.cs
// Namespace : Backend.Controllers
// Purpose: Manage EV charging stations: list, create, update, (de)activate,
//          detail view (with optional expand), and basic counts.
// -----------------------------------------------------------------------------
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;        // for IFormFile
using MongoDB.Driver;
using MongoDB.Bson;
using MongoDB.Driver.GridFS;
using Backend.Models;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize] // default: all actions require a valid JWT
public class StationsController : ControllerBase
{
    private readonly IMongoDatabase _db;
    private readonly GridFSBucket _images;                   // ✅ initialize this
    private readonly IMongoCollection<Station> _stations;
    private readonly IMongoCollection<Booking> _bookings;

    public StationsController(IMongoDatabase db)
    {
        _db = db;
        _stations = db.GetCollection<Station>("stations");
        _bookings = db.GetCollection<Booking>("bookings");
        _images = new GridFSBucket(db, new GridFSBucketOptions   // ✅ GridFS init
        {
            BucketName = "stationImages"
        });
    }

    // GET /api/stations
    // Any authenticated role can view stations (Backoffice/Operator/Owner)
    [HttpGet]
    public async Task<IActionResult> All()
    {
        var items = await _stations.Find(_ => true).ToListAsync();
        return Ok(items.Select(ToDto));
    }

    // view the stations
    // GET /api/stations/{id}?expand=false
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id, [FromQuery] bool expand = false)
    {
        var station = await _stations.Find(s => s.Id == id).FirstOrDefaultAsync();
        if (station == null) return NotFound();

        if (!expand) return Ok(ToDto(station));

        var pendingCount = await _bookings.CountDocumentsAsync(b =>
            b.StationId == id && b.Status == "Pending");

        return Ok(new { station = ToDto(station), pendingCount });
    }

    // Create a station
    // POST /api/stations  (Backoffice only)
    [Authorize(Roles = "Backoffice")]
    [HttpPost]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Create(
        [FromForm] string name,
        [FromForm] string type,
        [FromForm] int totalSlots,
        [FromForm] double? lat,
        [FromForm] double? lng,
        [FromForm] IFormFile? file
    )
    {
        // Validate
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(type))
            return BadRequest("Name and Type are required.");

        var station = new Station
        {
            Name = name,
            Type = type,
            TotalSlots = totalSlots,
            Lat = lat,
            Lng = lng,
            IsActive = true
        };

        // Save image to GridFS if present
        if (file != null && file.Length > 0)
        {
            var opts = new GridFSUploadOptions
            {
                Metadata = new BsonDocument
                {
                    { "stationName", name },
                    { "contentType", file.ContentType ?? "application/octet-stream" },
                    { "originalName", file.FileName }
                }
            };

            using var stream = file.OpenReadStream();
            var fileId = await _images.UploadFromStreamAsync(file.FileName, stream, opts);

            station.ImageFileId = fileId;
            station.ImageContentType = file.ContentType ?? "application/octet-stream";
        }

        await _stations.InsertOneAsync(station);

        var imageUrl = station.ImageFileId != null
            ? Url.ActionLink(nameof(GetImage), "Stations", new { id = station.Id })
            : null;

        return Ok(new
        {
            message = "Station created successfully",
            station.Id,
            station.Name,
            station.Type,
            station.TotalSlots,
            station.Lat,
            station.Lng,
            station.IsActive,
            imageUrl
        });
    }

    // update the station
    // PUT /api/stations/{id}  (Backoffice only)
    [Authorize(Roles = "Backoffice")]
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] Station s)
    {
        s.Id = id;
        var res = await _stations.ReplaceOneAsync(x => x.Id == id, s);
        return res.MatchedCount == 0 ? NotFound() : NoContent();
    }

    // deactivate a station
    // POST /api/stations/{id}/deactivate  (Backoffice or StationOperator)
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpPost("{id}/deactivate")]
    public async Task<IActionResult> Deactivate(string id)
    {
        var now = DateTime.UtcNow;

        // block if there are future Pending/Approved bookings
        var hasActiveFuture = await _bookings.Find(b =>
            b.StationId == id &&
            b.StartTime > now &&
            (b.Status == "Pending" || b.Status == "Approved")
        ).AnyAsync();

        if (hasActiveFuture)
            return Conflict(new { message = "Cannot deactivate: station has active future bookings." });

        var res = await _stations.UpdateOneAsync(
            s => s.Id == id,
            Builders<Station>.Update.Set(s => s.IsActive, false)
        );

        return res.MatchedCount == 0 ? NotFound() : Ok(new { message = "Station deactivated" });
    }

    // reactivate a station
    // POST /api/stations/{id}/reactivate  (Backoffice or StationOperator)
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpPost("{id}/reactivate")]
    public async Task<IActionResult> Reactivate(string id)
    {
        var res = await _stations.UpdateOneAsync(
            s => s.Id == id,
            Builders<Station>.Update.Set(s => s.IsActive, true)
        );

        return res.MatchedCount == 0 ? NotFound() : Ok(new { message = "Station reactivated" });
    }

    // get available stations count
    // GET /api/stations/count
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpGet("count")]
    public async Task<IActionResult> CountStations([FromQuery] bool? isActive)
    {
        var filter = isActive is null
            ? Builders<Station>.Filter.Empty
            : Builders<Station>.Filter.Eq(s => s.IsActive, isActive.Value);

        var total = await _stations.CountDocumentsAsync(filter);
        return Ok(new { total });
    }

    // GET image bytes
    [AllowAnonymous]
    [HttpGet("{id}/image")]
    public async Task<IActionResult> GetImage(string id)
    {
        var station = await _stations.Find(s => s.Id == id).FirstOrDefaultAsync();
        if (station is null || station.ImageFileId is null)
            return NotFound("Image not found.");

        var contentType = station.ImageContentType ?? "application/octet-stream";
        var bytes = await _images.DownloadAsBytesAsync(station.ImageFileId.Value);

        // Optional cache header
        Response.Headers.CacheControl = "public,max-age=86400";
        return File(bytes, contentType);
    }

    // update the station image
    // PUT /api/stations/{id}/image  (Backoffice only)
    [Authorize(Roles = "Backoffice")]
    [HttpPut("{id}/image")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UpdateImage(string id, [FromForm] IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("Image file is required.");

        // allow only png/jpg
        var allowed = new[] { "image/png", "image/jpeg" };
        var ct = file.ContentType?.ToLowerInvariant() ?? "";
        if (!allowed.Contains(ct))
            return BadRequest("Only PNG or JPG images are allowed.");

        // optional size limit (e.g., 5 MB)
        const long MAX_BYTES = 5 * 1024 * 1024;
        if (file.Length > MAX_BYTES)
            return BadRequest("Image is too large (max 5 MB).");

        // fetch station
        var station = await _stations.Find(s => s.Id == id).FirstOrDefaultAsync();
        if (station is null) return NotFound("Station not found.");

        // upload new image to GridFS
        var opts = new GridFSUploadOptions
        {
            Metadata = new BsonDocument
        {
            { "stationId", id },
            { "contentType", ct },
            { "originalName", file.FileName }
        }
        };

        ObjectId newFileId;
        using (var stream = file.OpenReadStream())
        {
            newFileId = await _images.UploadFromStreamAsync(file.FileName, stream, opts);
        }

        // remember old file to delete after update
        var oldFileId = station.ImageFileId;

        // update station document
        var upd = Builders<Station>.Update
            .Set(s => s.ImageFileId, newFileId)
            .Set(s => s.ImageContentType, ct);
        await _stations.UpdateOneAsync(s => s.Id == id, upd);

        // delete old file (best-effort)
        if (oldFileId.HasValue)
        {
            try { await _images.DeleteAsync(oldFileId.Value); } catch { /* ignore */ }
        }

        // respond with fresh URL
        var imageUrl = Url.ActionLink(nameof(GetImage), "Stations", new { id });
        return Ok(new { message = "Image updated.", imageUrl });
    }

    // GET /api/stations/mine  — return only stations assigned to the logged-in operator
    [HttpGet("mine")]
    [Authorize(Roles = "StationOperator")]
    public async Task<IActionResult> Mine([FromServices] IMongoDatabase db)
    {
        var users = db.GetCollection<User>("users");

        // You already put `ClaimTypes.Name = user.Email` in the token
        var email = User.Identity?.Name?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(email)) return Unauthorized();

        var me = await users.Find(u => u.Email == email && u.IsActive && u.Role == "StationOperator")
                            .FirstOrDefaultAsync();
        if (me is null) return Unauthorized();

        var ids = me.AssignedStationIds ?? new List<string>();
        if (ids.Count == 0) return Ok(Array.Empty<object>());

        var stationList = await _stations.Find(s => ids.Contains(s.Id) && s.IsActive).ToListAsync();
        return Ok(stationList.Select(ToDto));
    }



    // ---- mapping helpers -----------------------------------------------------

    private string? BuildImageUrl(Station s)
        => s.ImageFileId is null ? null
           : Url.ActionLink(nameof(GetImage), "Stations", new { id = s.Id });

    private StationDto ToDto(Station s)
        => new StationDto(s.Id, s.Name, s.Type, s.TotalSlots, s.Lat, s.Lng, s.IsActive, BuildImageUrl(s));
}
