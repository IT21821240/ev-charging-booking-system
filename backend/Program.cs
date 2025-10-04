using MongoDB.Driver;
using DotNetEnv;
using Backend.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Backend.Models;

var builder = WebApplication.CreateBuilder(args);

// 1) Load .env (optional) and register Mongo
Env.Load(); // reads .env if present

builder.Configuration.AddEnvironmentVariables();

builder.Services.AddSingleton<IMongoClient>(_ =>
    new MongoClient(
        Environment.GetEnvironmentVariable("MONGO_CONNECTION_STRING")
        ?? builder.Configuration["Mongo:ConnectionString"] // fallback to appsettings
    ));

builder.Services.AddSingleton<IMongoDatabase>(sp =>
{
    var client = sp.GetRequiredService<IMongoClient>();
    var dbName = Environment.GetEnvironmentVariable("MONGO_DATABASE")
                ?? builder.Configuration["Mongo:Database"];
    return client.GetDatabase(dbName);
});

// 2) Web API services
builder.Services.AddControllers();

// (optional) OpenAPI/Swagger (your template uses new Minimal OpenAPI helpers)
builder.Services.AddOpenApi();

builder.Services.AddScoped<Backend.Services.BookingRules>();

// JWT settings
var jwtKey = Environment.GetEnvironmentVariable("JWT_KEY") ?? builder.Configuration["Jwt:Key"];
var jwtIssuer = Environment.GetEnvironmentVariable("JWT_ISSUER") ?? builder.Configuration["Jwt:Issuer"] ?? "evcs.api";
var jwtAudience = Environment.GetEnvironmentVariable("JWT_AUDIENCE") ?? builder.Configuration["Jwt:Audience"] ?? "evcs.clients";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey!)),
            ClockSkew = TimeSpan.Zero // make token expiry exact, no grace period
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddSingleton<IQrTokenService, QrTokenService>();
builder.Services.AddScoped<IQrValidator, QrValidator>();
builder.Services.AddScoped<IBookingsRepository, BookingsRepository>();

builder.Services.AddCors(opt =>
{
    opt.AddPolicy("AllowedOrigins", p => p
        .WithOrigins("http://localhost:5173", "http://localhost:3000") // your React dev URL(s)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});

var app = builder.Build();

app.UseCors("AllowedOrigins");

app.UseAuthentication();
app.UseAuthorization();

// 3) Pipeline
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi(); // /openapi/v1.json  (or enable Swagger if you prefer)
}

app.UseHttpsRedirection();

app.MapControllers(); // map attribute-routed controllers

// keep your sample endpoint
var summaries = new[]
{
    "Freezing","Bracing","Chilly","Cool","Mild","Warm","Balmy","Hot","Sweltering","Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast = Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast(
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        )).ToArray();
    return forecast;
})
.WithName("GetWeatherForecast");

app.MapGet("/health", () => Results.Ok(new { ok = true, time = DateTime.UtcNow }));

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
