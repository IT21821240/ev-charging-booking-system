namespace Backend.Models;

public class Station
{
	public string Id { get; set; } = Guid.NewGuid().ToString("N");
	public string Name { get; set; } = "";
	public string Type { get; set; } = "AC"; // AC | DC
	public int TotalSlots { get; set; }
	public double? Lat { get; set; }
	public double? Lng { get; set; }
	public bool IsActive { get; set; } = true;
}
